class WeatherApp {
    constructor(weather, location, debug = false) {
        this.debug = debug;
        this.weather = weather || {};
        this.location = location || {};
        this.container = document.getElementById('weather-wrap');

        if (this.debug) {
            console.log("Weather Data:", this.weather);
            console.log("Location Data:", this.location);
        }

        this.init();
    }

    init() {
        this.updateTextContent();

        // set scene
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.renderer = new THREE.WebGLRenderer({antialias: true});

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Initialize colors
        this.baseColorA = new THREE.Vector3(0.95, 0.95, 0.95);
        this.baseColorB = new THREE.Vector3(0.80, 0.80, 0.95);
        this.baseColorC = new THREE.Vector3(0.75, 0.85, 0.95);
        this.baseColorD = new THREE.Vector3(0.90, 0.90, 0.70);

        this.currentColorTransition = {
            active: false,
            startTime: 0,
            duration: 2.5, // Quick enough to see but not too jarring
            startColors: [],
            targetColors: []
        };

        // Create shaders
        this.vertexShader = `
            uniform float uTime;
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        this.fragmentShader = `
             uniform float time;
             uniform vec3 colorA;
             uniform vec3 colorB;
             uniform vec3 colorC;
             uniform vec3 colorD;
             uniform float noiseIntensity;
             uniform float noiseScale;

             varying vec2 vUv;

             // Simplex noise function
             vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
             vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
             vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

             float snoise(vec2 v) {
                 const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                                     0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                                     0.024390243902439); // 1.0 / 41.0

                 // First corner
                 vec2 i  = floor(v + dot(v, C.yy));
                 vec2 x0 = v -   i + dot(i, C.xx);

                 // Other corners
                 vec2 i1;
                 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                 vec4 x12 = x0.xyxy + C.xxzz;
                 x12.xy -= i1;

                 // Permutations
                 i = mod289(i); // Avoid truncation effects in permutation
                 vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                                  + i.x + vec3(0.0, i1.x, 1.0 ));

                 vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
                 m = m*m;
                 m = m*m;

                 // Gradients
                 vec3 x = 2.0 * fract(p * C.www) - 1.0;
                 vec3 h = abs(x) - 0.5;
                 vec3 ox = floor(x + 0.5);
                 vec3 a0 = x - ox;

                 // Normalise gradients
                 m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

                 // Compute final noise value at P
                 vec3 g;
                 g.x  = a0.x  * x0.x  + h.x  * x0.y;
                 g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                 return 130.0 * dot(m, g);
             }

             // Function to create a gradient with very distinct regions
             vec3 contrastGradient(vec2 uv) {
                 // Add minimal noise to UVs to maintain color clarity
                 float noise = snoise(uv * noiseScale + time * 0.05) * noiseIntensity * 0.5;
                 vec2 displacedUv = uv + vec2(noise * 0.01);

                 // Create very distinct circular regions
                 vec2 center1 = vec2(0.3, 0.3);
                 vec2 center2 = vec2(0.7, 0.7);
                 vec2 center3 = vec2(0.9, 0.2);
                 vec2 center4 = vec2(0.1, 0.8);

                 // Calculate distances
                 float dist1 = length(displacedUv - center1);
                 float dist2 = length(displacedUv - center2);
                 float dist3 = length(displacedUv - center3);
                 float dist4 = length(displacedUv - center4);

                 // Create much sharper falloffs for more distinct regions
                 float influence1 = smoothstep(0.7, 0.0, dist1);
                 float influence2 = smoothstep(0.7, 0.0, dist2);
                 float influence3 = smoothstep(0.6, 0.0, dist3);
                 float influence4 = smoothstep(0.6, 0.0, dist4);

                 // Heighten contrast by using power function
                 influence1 = pow(influence1, 0.7);
                 influence2 = pow(influence2, 0.7);
                 influence3 = pow(influence3, 0.7);
                 influence4 = pow(influence4, 0.7);

                 // Normalize influences
                 float totalInfluence = influence1 + influence2 + influence3 + influence4;
                 if (totalInfluence > 0.0) {
                     influence1 /= totalInfluence;
                     influence2 /= totalInfluence;
                     influence3 /= totalInfluence;
                     influence4 /= totalInfluence;
                 } else {
                     // Default to color A if no influence (shouldn't happen)
                     return colorA;
                 }

                 // Mix colors based on influence
                 return colorA * influence1 +
                        colorB * influence2 +
                        colorC * influence3 +
                        colorD * influence4;
             }

             void main() {
                 // Get color from our enhanced gradient function
                 vec3 color = contrastGradient(vUv);

                 // Very minimal noise to preserve color clarity
                 float noise = snoise(vUv * noiseScale * 2.0 + time * 0.03);
                 color += vec3(noise * 0.02);

                 gl_FragColor = vec4(color, 1.0);
             }
         `;

        this.uniforms = {
            time: {value: 0},
            colorA: {value: this.baseColorA},
            colorB: {value: this.baseColorB},
            colorC: {value: this.baseColorC},
            colorD: {value: this.baseColorD},
            noiseIntensity: {value: 0.5}, // Reduced noise to emphasize color differences
            noiseScale: {value: 2.0}
        }

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader
        });

        // Create a plane that fills the screen
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.plane = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.plane);

        // Start animation
        this.animate();

        // Handle window resize
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Update shader colors based on weather data
        this.updateShaderColors(this.weather.temp_c, this.weather.condition.text);
    }

    // animation loop
    animate() {
        requestAnimationFrame(() => this.animate());
        this.uniforms.time.value += 0.01;

        // Handle color transitions if active
        if (this.currentColorTransition.active) {
            const elapsed = (Date.now() - this.currentColorTransition.startTime) / 1000;
            const t = Math.min(elapsed / this.currentColorTransition.duration, 1.0);

            // Sharp transition that slows at the end
            // Jump quickly to ~80% of the way, then slow down for the last 20%
            // This creates a more dramatic shift between colors
            const ease = t < 0.6 ? 1.3 * t : 0.8 + (t - 0.6) * 0.5;

            // Update all colors based on transition
            for (let i = 0; i < 4; i++) {
                const current = this.uniforms[`color${String.fromCharCode(65 + i)}`].value;
                const start = this.currentColorTransition.startColors[i];
                const target = this.currentColorTransition.targetColors[i];

                current.x = start.x + (target.x - start.x) * ease;
                current.y = start.y + (target.y - start.y) * ease;
                current.z = start.z + (target.z - start.z) * ease;
            }

            // End transition when complete
            if (t >= 1.0) {
                this.currentColorTransition.active = false;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    // update text content based on weather data
    updateTextContent() {
        const locationElement = document.getElementById('location');
        const weatherConditionElement = document.getElementById('weather');
        const mainEnergyElement = document.getElementById('main-energy');
        const secondaryEnergyElement = document.getElementById('secondary-energy');
        const currentProductionElement = document.getElementById('current-production'); // in TWh
        const hydroEnergyElement = document.getElementById('hydro-energy'); // in GWh

        // Set location and weather condition
        locationElement.textContent = this.location.name.toUpperCase();
        weatherConditionElement.textContent = this.weather.condition.text.toUpperCase();

        // Set energy sources information
        const energySources = this.getEnergySources();
        mainEnergyElement.textContent = energySources.primarySource;
        secondaryEnergyElement.textContent = energySources.secondarySource;
        hydroEnergyElement.innerHTML = energySources.energyValue;
        currentProductionElement.innerHTML = energySources.totalProduction;
    }

    // get energy sources based on weather data
    getEnergySources() {
        const windSpeed = this.weather.wind_kph;
        const cloudCover = this.weather.cloud;
        const uvIndex = this.weather.uv;
        const humidity = this.weather.humidity;

        // Nieuwe benadering zonnepotentieel
        const clearSkyFactor = 1 - (cloudCover / 100);
        const uvFactor = uvIndex / 10;
        const solarPotential = Math.min(1, (clearSkyFactor * 0.7) + (uvFactor * 0.3));

        const windPotential = Math.min(1, windSpeed / 40); // wind effectief t/m 40 kph
        const hydroPotential = Math.min(1, humidity / 100); // benadering

        // Energie in GWh
        const solarGWh = solarPotential * 500;
        const windGWh = windPotential * 400;
        const hydroGWh = hydroPotential * 300;

        const totalGWh = solarGWh + windGWh + hydroGWh;
        const totalProduction = (totalGWh / 1000).toFixed(2);
        const energyValue = hydroGWh.toFixed(0);

        const sources = [
            {name: 'SOLAR', value: solarGWh},
            {name: 'WIND', value: windGWh},
            {name: 'HYDRO', value: hydroGWh},
        ];
        sources.sort((a, b) => b.value - a.value);

        if (this.debug) {
            console.log("Energy Sources:", sources);
            console.log("Total Production (TWh):", totalProduction);
            console.log("Energy Value (GWh):", energyValue);
        }

        return {
            primarySource: sources[0].name,
            secondarySource: sources[1].name,
            energyValue,
            totalProduction
        };
    }

    // update shader colors based on weather data
    updateShaderColors(temperature, weatherType) {
        let colorSet;

        // Extremely distinct color palettes for different conditions
        if (weatherType === "Clear" || weatherType === "Sunny") {
            if (temperature > 25) {
                // Hot sunny day - Intense oranges and yellows
                colorSet = [
                    new THREE.Vector3(1.00, 0.90, 0.30), // Bright yellow
                    new THREE.Vector3(1.00, 0.65, 0.20), // Orange
                    new THREE.Vector3(1.00, 0.40, 0.10), // Deep orange
                    new THREE.Vector3(1.00, 0.80, 0.50)  // Light orange
                ];
            } else {
                // Pleasant sunny day - Sky blues with yellow accent
                colorSet = [
                    new THREE.Vector3(0.40, 0.70, 1.00), // Sky blue
                    new THREE.Vector3(0.60, 0.80, 1.00), // Light blue
                    new THREE.Vector3(0.80, 0.90, 1.00), // Very light blue
                    new THREE.Vector3(1.00, 0.95, 0.70)  // Light yellow accent
                ];
            }
        } else if (weatherType === "Rain" || weatherType === "Drizzle" || weatherType.includes("rain")) {
            // Rainy - Deep blues and grays
            colorSet = [
                new THREE.Vector3(0.20, 0.20, 0.35), // Dark blue-gray
                new THREE.Vector3(0.30, 0.35, 0.50), // Medium blue-gray
                new THREE.Vector3(0.45, 0.50, 0.65), // Lighter blue-gray
                new THREE.Vector3(0.60, 0.65, 0.80)  // Light blue-gray
            ];
        } else if (weatherType === "Snow" || weatherType.includes("snow")) {
            // Snowy - White blues
            colorSet = [
                new THREE.Vector3(0.90, 0.95, 1.00), // White with blue tint
                new THREE.Vector3(0.85, 0.90, 1.00), // Very light blue
                new THREE.Vector3(0.75, 0.85, 1.00), // Light blue
                new THREE.Vector3(0.70, 0.80, 0.95)  // Slightly deeper blue
            ];
        } else if (weatherType === "Clouds" || weatherType === "Fog" || weatherType.includes("cloud") || weatherType.includes("overcast")) {
            if (temperature < 10) {
                // Cold cloudy - Gray with blue tint
                colorSet = [
                    new THREE.Vector3(0.70, 0.70, 0.75), // Light gray
                    new THREE.Vector3(0.60, 0.60, 0.70), // Medium gray with blue
                    new THREE.Vector3(0.50, 0.50, 0.60), // Darker gray with blue
                    new THREE.Vector3(0.40, 0.40, 0.50)  // Dark gray-blue
                ];
            } else {
                // Warm cloudy - Gray with yellow tint
                colorSet = [
                    new THREE.Vector3(0.80, 0.80, 0.75), // Light warm gray
                    new THREE.Vector3(0.70, 0.70, 0.65), // Medium warm gray
                    new THREE.Vector3(0.60, 0.60, 0.55), // Darker warm gray
                    new THREE.Vector3(0.50, 0.50, 0.45)  // Dark warm gray
                ];
            }
        } else if (weatherType === "Thunderstorm" || weatherType.includes("storm")) {
            // Thunderstorm - Dramatic purples and dark blues
            colorSet = [
                new THREE.Vector3(0.20, 0.10, 0.30), // Dark purple
                new THREE.Vector3(0.30, 0.15, 0.40), // Deep purple
                new THREE.Vector3(0.40, 0.20, 0.50), // Medium purple
                new THREE.Vector3(0.15, 0.15, 0.25)  // Very dark blue-purple
            ];
        } else {
            // Default - Neutral colors
            colorSet = [
                new THREE.Vector3(0.80, 0.80, 0.80), // Light gray
                new THREE.Vector3(0.70, 0.70, 0.70), // Medium gray
                new THREE.Vector3(0.60, 0.60, 0.60), // Dark gray
                new THREE.Vector3(0.80, 0.80, 0.70)  // Warm gray
            ];
        }

        // Temperature modifications to existing color sets
        // This adds an additional layer of variation
        if (temperature < 0) {
            // Extreme cold - add more deep blue
            for (let i = 0; i < colorSet.length; i++) {
                colorSet[i].x *= 0.7;      // Reduce red
                colorSet[i].y *= 0.8;      // Reduce green somewhat
                colorSet[i].z = Math.min(1.0, colorSet[i].z * 1.2); // Increase blue
            }
        } else if (temperature > 30) {
            // Extreme heat - add more red
            for (let i = 0; i < colorSet.length; i++) {
                colorSet[i].x = Math.min(1.0, colorSet[i].x * 1.2); // Increase red
                colorSet[i].y *= 0.9;      // Reduce green somewhat
                colorSet[i].z *= 0.7;      // Reduce blue
            }
        }

        // Make sure colors are truly distinct by enhancing variation
        const avgColor = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < colorSet.length; i++) {
            avgColor.add(colorSet[i]);
        }
        avgColor.divideScalar(colorSet.length);

        // Push colors further from average for more contrast
        for (let i = 0; i < colorSet.length; i++) {
            const direction = new THREE.Vector3().subVectors(colorSet[i], avgColor).normalize();
            // Push colors 30% further from average
            colorSet[i].addScaledVector(direction, 0.3);

            // Clamp to valid range
            colorSet[i].x = Math.max(0, Math.min(1, colorSet[i].x));
            colorSet[i].y = Math.max(0, Math.min(1, colorSet[i].y));
            colorSet[i].z = Math.max(0, Math.min(1, colorSet[i].z));
        }

        // Set up color transition with dramatically different colors
        this.startColorTransition(colorSet);
    }

    startColorTransition(targetColors) {
        if (this.debug) {
            console.log("Starting color transition to:", targetColors);
        }

        // Store current colors
        this.currentColorTransition.startColors = [
            this.uniforms.colorA.value.clone(),
            this.uniforms.colorB.value.clone(),
            this.uniforms.colorC.value.clone(),
            this.uniforms.colorD.value.clone()
        ];

        // Store target colors
        this.currentColorTransition.targetColors = targetColors;

        // Start the transition
        this.currentColorTransition.active = true;
        this.currentColorTransition.startTime = Date.now();
    }
}

// Eerst IP ophalen
fetch('https://api.ipify.org?format=json')
    .then(response => response.json())
    .then(data => {
        const userIP = data.ip;

        // Daarna je fetch naar je proxy endpoint doen, met IP in de headers of body
        fetch('https://preview.nu/weather_proxy.php', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-IP': userIP, // Bijvoorbeeld als header
            },
        })
            .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok ' + response.statusText);
                    }
                    return response.json();
                }
            )
            .then(data => {
                const app = new WeatherApp(data.weather.current, data.weather.location, true);
            })
    });

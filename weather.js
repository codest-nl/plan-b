import * as THREE from 'three';


class WeatherApp {
    constructor(weather, location, debug = false) {
        this.debug = debug;
        this.weather = weather || {};
        this.location = location || {};
        this.container = document.getElementById('weather-wrap');

        this.init();

        if (this.debug) {
            console.log("Weather Data:", this.weather);
            console.log("Location Data:", this.location);
            this.debugWeatherTypes(); // Start debug weather types if enabled
        }
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
             uniform vec3 colorA; // Lichte kleur
             uniform vec3 colorB; // Donkere kleur
             uniform vec3 colorC; // Andere donkere kleur
             uniform vec3 colorD; // Nog een andere donkere kleur
             uniform float noiseIntensity;
             uniform float noiseScale; // Blijft voor algemene fijnheid/grofheid

             varying vec2 vUv;

             // Simplex noise function (onveranderd)
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

             // Hulpfunctie voor UV-rotatie
             vec2 rotateUV(vec2 uv, float angle) {
                 float s = sin(angle);
                 float c = cos(angle);
                 mat2 rot = mat2(c, -s, s, c);
                 return rot * (uv - 0.5) + 0.5; // Roteer rond het midden (0.5, 0.5)
             }

             vec3 organicGradient(vec2 uv) {
                 // **AANGEPAST: Introduceer verschillende rotaties en offsets**
                 // Gebruik noiseScale uniform hier voor algemene controle over detail.
                 vec2 uvA = uv * noiseScale;
                 vec2 uvB = rotateUV(uv, 1.5708) * noiseScale; // Roteer 90 graden (PI/2)
                 vec2 uvC = rotateUV(uv, 0.7854) * noiseScale; // Roteer 45 graden (PI/4)
                 vec2 uvD = rotateUV(uv, 2.3562) * noiseScale; // Roteer 135 graden (3PI/4)


                 // Meer variatie in frequenties en snelheden voor de noise-lagen
                 float noise1 = snoise(uvA + time * 0.05); // Basisfrequentie en snelheid
                 float noise2 = snoise(uvB + time * 0.07 + 10.0); // Roterende UV, andere snelheid
                 float noise3 = snoise(uvC + time * 0.04 + 20.0); // Roterende UV, weer andere snelheid
                 float noise4 = snoise(uvD + time * 0.06 + 30.0); // Roterende UV, vierde snelheid
                 float noise5 = snoise(uv * (noiseScale * 0.7) + time * 0.03 + 40.0); // Nog een laag, lagere frequentie
                 float noise6 = snoise(uv * (noiseScale * 1.2) + time * 0.08 + 50.0); // Nog een laag, hogere frequentie

                 // **AANGEPAST: Complexere combinatie voor displacedUv**
                 // Combineer verschillende noise-lagen in verschillende verhoudingen
                 // Dit doorbreekt de diagonale beweging en maakt het meer golvend/blob-achtig
                 vec2 displacementX = vec2(noise1 * 0.5 + noise3 * 0.3 + noise5 * 0.2, 0.0); // Vooral X displacement
                 vec2 displacementY = vec2(0.0, noise2 * 0.5 + noise4 * 0.3 + noise6 * 0.2); // Vooral Y displacement

                 vec2 displacedUv = uv + (displacementX + displacementY) * noiseIntensity * 0.02; // Verminder de algemene schaal van displacement

                 // Gebruik een hoofd-noise voor de primaire blending, gebaseerd op een algemene displaced UV
                 // En combineer deze met een andere noise voor nog meer complexiteit
                 float mainNoise = snoise(displacedUv * 1.5 + time * 0.03);
                 float secondaryMainNoise = snoise(rotateUV(displacedUv, 0.5) * 2.0 + time * 0.05); // Grote, roterende noise

                 float primaryBlend = (mainNoise * 0.6 + secondaryMainNoise * 0.4); // Combineer ze voor complexiteit
                 primaryBlend = primaryBlend * 0.5 + 0.5; // Normaliseer naar 0-1

                 float edgeSharpness = 8.0;

                 // Verdeling lichte/donkere kleuren (deze waarden zijn goed voor meer licht)
                 float stepThreshold = 0.6;

                 float blendFactor = smoothstep(stepThreshold - (0.5 / edgeSharpness), stepThreshold + (0.5 / edgeSharpness), primaryBlend);

                 vec3 resultColor = mix(colorA, colorB, blendFactor); // colorA is lichter, colorB donkerder

                 // De masks voor C en D blijven op hogere drempels voor minder dominantie
                 float secondaryBlend = snoise(displacedUv * 0.8 + time * 0.02 + 50.0);
                 secondaryBlend = secondaryBlend * 0.5 + 0.5;
                 float secondaryMask = smoothstep(0.7, 0.9, secondaryBlend);
                 resultColor = mix(resultColor, colorC, secondaryMask);

                 float tertiaryBlend = snoise(displacedUv * 0.7 + time * 0.04 + 100.0);
                 tertiaryBlend = tertiaryBlend * 0.5 + 0.5;
                 float tertiaryMask = smoothstep(0.6, 0.8, tertiaryBlend);
                 resultColor = mix(resultColor, colorD, tertiaryMask);

                 return resultColor;
             }

             void main() {
                 vec3 color = organicGradient(vUv);
                 gl_FragColor = vec4(color, 1.0);
             }
         `;

        this.uniforms = {
            time: {value: 0},
            colorA: {value: this.baseColorA},
            colorB: {value: this.baseColorB},
            colorC: {value: this.baseColorC},
            colorD: {value: this.baseColorD},
            noiseIntensity: {value: 4.0},
            noiseScale: {value: 2.5},
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

        if (weatherType === "Clear" || weatherType === "Sunny") {
            // Gebruik Zonnig kleuren
            colorSet = [
                new THREE.Vector3(1.0, 0.188, 0.251),
                new THREE.Vector3(1.0, 0.765, 0.811),
                new THREE.Vector3(1.0, 0.188, 0.251),  // rgba(255, 48, 64, 1)
                new THREE.Vector3(1.0, 0.765, 0.811),  // rgba(255, 195, 207, 1)
            ];
        } else if (weatherType === "Rain" || weatherType === "Drizzle" || weatherType.includes("rain")) {
            // Gebruik Regen / Bewolkt kleuren
            colorSet = [
                new THREE.Vector3(0.992, 0.996, 0.765),  // rgba(253, 254, 195, 1)
                new THREE.Vector3(0.929, 0.929, 0.929),  // rgba(237, 237, 237, 1)
                new THREE.Vector3(0.992, 0.996, 0.765),
                new THREE.Vector3(0.929, 0.929, 0.929),
            ];
        } else if (weatherType === "Clouds" || weatherType === "Fog" || weatherType.includes("cloud") || weatherType.includes("overcast")) {
            // Gebruik Regen / Bewolkt kleuren voor bewolkt
            colorSet = [
                new THREE.Vector3(0.992, 0.996, 0.765),
                new THREE.Vector3(0.929, 0.929, 0.929),
                new THREE.Vector3(0.992, 0.996, 0.765),
                new THREE.Vector3(0.929, 0.929, 0.929),
            ];
        } else if (weatherType === "Wind" || weatherType === "Storm" || weatherType.includes("wind") || weatherType.includes("storm")) {
            // Gebruik Wind / storm kleuren
            colorSet = [
                new THREE.Vector3(0.627, 0.914, 1.0),
                new THREE.Vector3(0.282, 0.016, 0.973),
                new THREE.Vector3(0.627, 0.914, 1.0),    // rgba(160, 233, 255, 1)
                new THREE.Vector3(0.282, 0.016, 0.973),  // rgba(72, 4, 248, 1)
            ];
        } else {
            // Fallback kleuren (neutraal grijs)
            colorSet = [
                new THREE.Vector3(0.8, 0.8, 0.8),
                new THREE.Vector3(0.6, 0.6, 0.6),
                new THREE.Vector3(0.7, 0.7, 0.7),
                new THREE.Vector3(0.9, 0.9, 0.9),
            ];
        }

        // Start overgang van huidige kleuren naar nieuwe set
        this.currentColorTransition.active = true;
        this.currentColorTransition.startTime = Date.now();
        this.currentColorTransition.startColors = [
            this.uniforms.colorA.value.clone(),
            this.uniforms.colorB.value.clone(),
            this.uniforms.colorC.value.clone(),
            this.uniforms.colorD.value.clone(),
        ];
        this.currentColorTransition.targetColors = colorSet;
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

    // if debug mode is enabled, loop trough different weather types
    debugWeatherTypes() {
        if (!this.debug) return;

        const weatherTypes = [
            "Clear", "Sunny", "Rain", "Drizzle", "Clouds", "Fog", "Wind", "Storm"
        ];

        let index = 0;
        setInterval(() => {
            const weatherType = weatherTypes[index % weatherTypes.length];
            this.updateShaderColors(this.weather.temp_c, weatherType);
            index++;
        }, 5000); // Change every 5 seconds
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
                const app = new WeatherApp(data.weather.current, data.weather.location, false);
            })
    });

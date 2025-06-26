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
                console.log('Success:', data);
            })
    });

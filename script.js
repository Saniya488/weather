async function getWeather(location = null, selectedCity = null) {
    const cityInput = document.getElementById('city-input');
    let input = (cityInput && typeof cityInput.value === 'string' ? cityInput.value.trim() : '') || location;
    const originalInput = input || 'Current Location';
    
    // Developer Note: If this key gets auto-revoked by GitHub scanner bots, 
    // users can register a free key at openweathermap.org and replace it here.
    const apiKey = '04a25b6616cd9d650bd9771e7862eb18'; 
    
    const geocodingUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(input)}&limit=5&appid=${apiKey}`;
    const reverseGeocodingUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat={lat}&lon={lon}&limit=5&appid=${apiKey}`;
    const airQualityUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid=${apiKey}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid=${apiKey}&units=metric`;

    const loading = document.getElementById('loading');
    const weatherInfo = document.getElementById('weather-info');
    const forecastSection = document.getElementById('forecast');
    const hourlySection = document.getElementById('hourly');
    const errorDiv = document.getElementById('error');
    const alertsDiv = document.getElementById('alerts');
    const welcomeDiv = document.getElementById('welcome');
    const suggestionsDiv = document.getElementById('suggestions');
    const cityLocation = document.getElementById('city-location');

    if (!input && !location) {
        showError('Please enter a city name (e.g., London,GB) or coordinates (e.g., lat:40.7,lon:-74.0).');
        return;
    }

    const hideAllUI = () => {
        loading.classList.remove('hidden');
        weatherInfo.classList.add('hidden');
        forecastSection.classList.add('hidden');
        hourlySection.classList.add('hidden');
        errorDiv.classList.add('hidden');
        alertsDiv.classList.add('hidden');
        welcomeDiv.classList.add('hidden');
        suggestionsDiv.classList.add('hidden');
        cityLocation.classList.add('hidden');
    };

    hideAllUI();

    let lat, lon, weatherDataFromAPI, forecastData;
    let displayName = originalInput;
    let locationDetails = '';
    const isManualInput = !location && (typeof input === 'string' && input.trim()) || selectedCity;

    const districtMapping = {
        'Hyderabad': 'Hyderabad District',
        'Mumbai': 'Mumbai District',
        'Delhi': 'Delhi District',
        'Bangalore': 'Bangalore Urban District',
        'Chennai': 'Chennai District'
    };

    const countryCodes = ['US', 'GB', 'IN', 'JP', 'FR', 'DE', 'CA', 'AU', 'BR', 'CN', 'ES', 'IT', 'MX', 'RU', 'KR', 'NG'];

    const countryMap = {
        'united states': 'US', 'usa': 'US', 'united kingdom': 'GB', 'uk': 'GB', 'india': 'IN',
        'japan': 'JP', 'france': 'FR', 'germany': 'DE', 'canada': 'CA', 'australia': 'AU',
        'brazil': 'BR', 'china': 'CN', 'spain': 'ES', 'italy': 'IT', 'mexico': 'MX',
        'russia': 'RU', 'south korea': 'KR', 'nigeria': 'NG'
    };

    // 12-second timeout to accommodate slower mobile networks
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), 12000);
    });

    try {
        if (location && location.coords) {
            lat = location.coords.latitude;
            lon = location.coords.longitude;
            displayName = `Current Location`;
        } else if (typeof input === 'string' && input.includes('lat:') && input.includes('lon:')) {
            const parts = input.replace('lat:', '').replace('lon:', '').split(',');
            if (parts.length >= 2) {
                lat = parseFloat(parts[0].trim());
                lon = parseFloat(parts[1].trim());
                if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    throw new Error('Invalid coordinates. Use format "lat:40.7,lon:-74.0" with valid ranges.');
                }
                displayName = `Coordinates`;
            } else {
                throw new Error('Invalid coordinates format. Use "lat:40.7,lon:-74.0".');
            }
        } else if (typeof input === 'string') {
            input = input.replace(/\s*,\s*/g, ',').trim();
            const parts = input.split(',');
            let city = parts[0].trim();
            let country = parts[1] ? parts[1].trim().toLowerCase() : '';

            if (country) {
                const normalizedCountryCode = country.toUpperCase();
                if (countryCodes.includes(normalizedCountryCode)) {
                    country = normalizedCountryCode;
                } else {
                    const mappedCountry = countryMap[country.toLowerCase()];
                    if (mappedCountry) {
                        country = mappedCountry;
                    } else {
                        throw new Error('Invalid country. Use a two-letter code (e.g., US, GB, IN, NG) or country name (e.g., Japan, Nigeria).');
                    }
                }
            }
            const query = country ? `${city},${country}` : city;

            let geoData = [];
            let geoSuccess = false;

            // Attempt Geocoding API with a try-catch so it doesn't crash the program if it fails or times out
            try {
                const geoResponse = await Promise.race([
                    fetch(geocodingUrl.replace(encodeURIComponent(input), encodeURIComponent(query))), 
                    timeoutPromise
                ]);
                if (geoResponse.ok) {
                    geoData = await geoResponse.json();
                    geoSuccess = true;
                } else if (geoResponse.status === 401) {
                    throw new Error('KEY_SUSPENDED');
                }
            } catch (err) {
                if (err.message === 'KEY_SUSPENDED') throw err;
                console.warn("Geocoding API failed or timed out. Attempting fallback direct query...", err);
            }

            // FALLBACK PATH: If Geocoding API fails or returns no results, query Weather API directly using city name
            if (!geoSuccess || geoData.length === 0) {
                const fallbackWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${apiKey}&units=metric`;
                const fallbackForecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(query)}&appid=${apiKey}&units=metric`;

                const weatherResponse = await Promise.race([fetch(fallbackWeatherUrl), timeoutPromise]);
                if (!weatherResponse.ok) {
                    handleHttpErrors(weatherResponse);
                }
                weatherDataFromAPI = await weatherResponse.json();
                lat = weatherDataFromAPI.coord.lat;
                lon = weatherDataFromAPI.coord.lon;
                displayName = weatherDataFromAPI.name + (weatherDataFromAPI.sys.country ? `, ${weatherDataFromAPI.sys.country}` : '');

                const forecastResponse = await Promise.race([fetch(fallbackForecastUrl), timeoutPromise]);
                if (forecastResponse.ok) {
                    forecastData = await forecastResponse.json();
                } else {
                    throw new Error("Unable to fetch forecast data.");
                }
            } else {
                // PRIMARY PATH: Geocoding was successful
                const selected = selectedCity ? geoData.find(city => `${city.name}, ${city.country}` === selectedCity) : geoData[0];
                if (!selected) {
                    throw new Error(`No matching city found for "${query}".`);
                }
                lat = selected.lat;
                lon = selected.lon;
                displayName = selected.name + (selected.country ? `, ${selected.country}` : '');

                if (isManualInput) {
                    if (selected.country === 'IN' && districtMapping[selected.name]) {
                        locationDetails = `${selected.name}, ${districtMapping[selected.name]}`;
                    } else {
                        locationDetails = `${selected.name}, ${selected.country}`;
                    }
                    cityLocation.textContent = locationDetails;
                    cityLocation.classList.remove('hidden');
                }
            }
        } else {
            throw new Error('Invalid input. Please enter a valid city name or coordinates.');
        }

        // Fetch Weather details using Coordinates
        if (!weatherDataFromAPI) {
            const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
            const weatherResponse = await Promise.race([fetch(weatherUrl), timeoutPromise]);
            if (!weatherResponse.ok) {
                handleHttpErrors(weatherResponse);
            }
            weatherDataFromAPI = await weatherResponse.json();
        }

        // Fetch Air Quality using Coordinates
        const airQualityResponse = await Promise.race([fetch(airQualityUrl.replace('{lat}', lat).replace('{lon}', lon)), timeoutPromise]);
        const airQualityData = airQualityResponse.ok ? await airQualityResponse.json() : { list: [{ main: { aqi: 'N/A' } }] };

        // Fetch Forecast using Coordinates (if not already fetched in fallback)
        if (!forecastData) {
            const forecastResponse = await Promise.race([fetch(forecastUrl.replace('{lat}', lat).replace('{lon}', lon)), timeoutPromise]);
            if (!forecastResponse.ok) {
                handleHttpErrors(forecastResponse);
            }
            forecastData = await forecastResponse.json();
        }

        // Populate Alerts
        let alertMessage = '';
        if (weatherDataFromAPI.alerts && weatherDataFromAPI.alerts.length > 0) {
            alertMessage = weatherDataFromAPI.alerts.map(alert => `${alert.event}: ${alert.description}`).join(' | ');
            alertsDiv.textContent = `Weather Alerts: ${alertMessage}`;
            alertsDiv.classList.remove('hidden');
        }

        // DOM Updates
        document.getElementById('city-name').textContent = displayName;
        document.getElementById('temperature').textContent = `${Math.round(weatherDataFromAPI.main.temp)}°C`;
        document.getElementById('feels-like').textContent = `${Math.round(weatherDataFromAPI.main.feels_like)}°C`;
        document.getElementById('description').textContent = weatherDataFromAPI.weather[0].description;
        document.getElementById('humidity').textContent = `${weatherDataFromAPI.main.humidity}%`;
        document.getElementById('pressure').textContent = `${weatherDataFromAPI.main.pressure} hPa`;
        document.getElementById('wind').textContent = `${weatherDataFromAPI.wind.speed} m/s`;
        document.getElementById('precipitation').textContent = `${Math.round(forecastData.list[0].pop * 100)}%`;
        
        const aqi = airQualityData.list[0].main.aqi !== undefined ? airQualityData.list[0].main.aqi : 'N/A';
        const aqiText = aqi === 1 ? 'Good' : aqi === 2 ? 'Fair' : aqi === 3 ? 'Moderate' : aqi === 4 ? 'Poor' : aqi === 5 ? 'Very Poor' : 'Unknown';
        document.getElementById('air-quality').textContent = `${aqi} (${aqiText})`;

        const uvi = weatherDataFromAPI.uvi || 'N/A';
        const uviText = uvi === 'N/A' ? 'Not available' : uvi <= 2 ? 'Low - Safe' : uvi <= 5 ? 'Moderate - Wear sunscreen' : uvi <= 7 ? 'High - Use sunscreen and hat' : uvi <= 10 ? 'Very High - Limit sun exposure' : 'Extreme - Avoid sun exposure';
        document.getElementById('uv-index').textContent = `${uvi} (${uviText})`;

        document.getElementById('sunrise').textContent = `${new Date(weatherDataFromAPI.sys.sunrise * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        document.getElementById('sunset').textContent = `${new Date(weatherDataFromAPI.sys.sunset * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        document.getElementById('weather-icon').src = `https://openweathermap.org/img/wn/${weatherDataFromAPI.weather[0].icon}@2x.png`;

        const now = new Date();
        const currentHour = now.getHours();
        const timeContext = currentHour < 12 ? 'Morning' : currentHour < 17 ? 'Afternoon' : currentHour < 20 ? 'Evening' : 'Night';
        document.getElementById('time-context').textContent = `${timeContext} Weather, ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} (Updated: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })})`;

        const weatherMain = weatherDataFromAPI.weather[0].description.toLowerCase().includes('rain') || weatherDataFromAPI.weather[0].description.toLowerCase().includes('shower') ? 'rain' : 
                            weatherDataFromAPI.weather[0].description.toLowerCase().includes('cloud') ? 'clouds' : 'clear';
        document.body.className = `flex flex-col min-h-screen ${weatherMain} bg-fixed font-inter transition-background duration-500`;

        // Hourly Container
        const hourlyContainer = document.getElementById('hourly-container');
        hourlyContainer.innerHTML = '';
        const hourlyData = forecastData.list.slice(0, 8);
        hourlyData.forEach((hour, index) => {
            const time = new Date(hour.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const card = `
                <div class="hourly-card bg-white bg-opacity-10 p-2 rounded-lg" style="--index: ${index};">
                    <p class="font-medium">${time}</p>
                    <img src="https://openweathermap.org/img/wn/${hour.weather[0].icon}@2x.png" alt="Hourly icon" class="w-8 h-8 mx-auto weather-icon-extra">
                    <p>${Math.round(hour.main.temp)}°C</p>
                    <p class="text-sm">Precip: ${Math.round(hour.pop * 100)}%</p>
                </div>
            `;
            hourlyContainer.insertAdjacentHTML('beforeend', card);
        });

        // Forecast Container
        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = '';
        const dailyData = forecastData.list.filter(item => item.dt_txt.includes('12:00:00'));
        dailyData.slice(0, 5).forEach((day, index) => {
            const date = new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const card = `
                <div class="forecast-card bg-white bg-opacity-10 p-2 rounded-lg" style="--index: ${index};">
                    <p class="font-semibold">${date}</p>
                    <img src="https://openweathermap.org/img/wn/${day.weather[0].icon}@2x.png" alt="Forecast icon" class="w-10 h-10 mx-auto weather-icon-extra">
                    <p>${Math.round(day.main.temp)}°C</p>
                    <p class="capitalize text-sm">${day.weather[0].description}</p>
                </div>
            `;
            forecastContainer.insertAdjacentHTML('beforeend', card);
        });

        weatherInfo.classList.remove('hidden');
        forecastSection.classList.remove('hidden');
        hourlySection.classList.remove('hidden');
        errorDiv.classList.add('hidden');
        loading.classList.add('hidden');

        if (isManualInput) {
            localStorage.setItem('lastLocation', originalInput);
        }
    } catch (error) {
        console.error('Error in getWeather:', error);
        if (error.message === 'TIMEOUT') {
            showError('Request timed out. This typically occurs if your browser, network firewall, VPN, or an ad-blocker is blocking "api.openweathermap.org" or if your API key was deactivated.');
        } else if (error.message === 'KEY_SUSPENDED') {
            showError('API Key inactive or suspended. OpenWeatherMap automatically disables keys exposed in public GitHub repos. To fix this, register a new free key at openweathermap.org and update your script.js file.');
        } else {
            showError(error.message);
        }
    }
}

function handleHttpErrors(response) {
    if (response.status === 401) {
        throw new Error('KEY_SUSPENDED');
    } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again in a few moments.');
    } else if (response.status === 404) {
        throw new Error('Location data unavailable. Ensure spelling is correct.');
    } else {
        throw new Error(`Weather system error. Code: ${response.status}`);
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    const weatherInfo = document.getElementById('weather-info');
    const forecastSection = document.getElementById('forecast');
    const hourlySection = document.getElementById('hourly');
    const alertsDiv = document.getElementById('alerts');
    const welcomeDiv = document.getElementById('welcome');
    const suggestionsDiv = document.getElementById('suggestions');
    const cityLocation = document.getElementById('city-location');
    
    errorDiv.innerHTML = `<span class="font-semibold">Error:</span> ${message}`;
    errorDiv.classList.remove('hidden');
    weatherInfo.classList.add('hidden');
    forecastSection.classList.add('hidden');
    hourlySection.classList.add('hidden');
    alertsDiv.classList.add('hidden');
    welcomeDiv.classList.add('hidden');
    suggestionsDiv.classList.add('hidden');
    cityLocation.classList.add('hidden');
    document.getElementById('loading').classList.add('hidden');
}

async function fetchSuggestions(query) {
    if (!query) return [];
    const apiKey = '04a25b6616cd9d650bd9771e7862eb18'; 
    try {
        const response = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${apiKey}`);
        if (!response.ok) {
            console.error('Error fetching suggestions:', response.statusText);
            return [];
        }
        const data = await response.json();
        return data.map(item => ({ name: `${item.name}, ${item.country}`, lat: item.lat, lon: item.lon }));
    } catch (error) {
        console.error('Error in fetchSuggestions:', error);
        return [];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const cityInput = document.getElementById('city-input');
    const welcomeDiv = document.getElementById('welcome');
    const weatherInfo = document.getElementById('weather-info');
    const forecastSection = document.getElementById('forecast');
    const hourlySection = document.getElementById('hourly');
    const errorDiv = document.getElementById('error');
    const alertsDiv = document.getElementById('alerts');
    const suggestionsDiv = document.getElementById('suggestions');
    const cityLocation = document.getElementById('city-location');
    const voiceSearchBtn = document.getElementById('voice-search-btn');

    if (cityInput) {
        cityInput.value = '';
    }

    welcomeDiv.classList.remove('hidden');
    weatherInfo.classList.add('hidden');
    forecastSection.classList.add('hidden');
    hourlySection.classList.add('hidden');
    errorDiv.classList.add('hidden');
    alertsDiv.classList.add('hidden');
    cityLocation.classList.add('hidden');

    if (cityInput) {
        cityInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') getWeather();
        });

        let debounceTimeout;
        cityInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(async () => {
                const query = e.target.value.trim();
                if (!query) {
                    suggestionsDiv.classList.add('hidden');
                    return;
                }
                const suggestions = await fetchSuggestions(query);
                suggestionsDiv.innerHTML = '';
                if (suggestions.length > 0) {
                    suggestionsDiv.classList.remove('hidden');
                    suggestions.forEach(suggestion => {
                        const li = document.createElement('li');
                        li.textContent = suggestion.name;
                        // Beautiful, high-contrast hover & select states
                        li.className = 'p-2 cursor-pointer text-gray-800 bg-white hover:bg-blue-600 hover:text-white transition-all duration-150 rounded text-sm';
                        li.addEventListener('click', () => {
                            cityInput.value = suggestion.name;
                            suggestionsDiv.classList.add('hidden');
                            getWeather(null, suggestion.name);
                        });
                        suggestionsDiv.appendChild(li);
                    });
                } else {
                    suggestionsDiv.classList.add('hidden');
                }
            }, 500);
        });

        document.addEventListener('click', (e) => {
            if (!cityInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
                suggestionsDiv.classList.add('hidden');
            }
        });
    }

    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';

        voiceSearchBtn.addEventListener('click', () => {
            recognition.start();
            voiceSearchBtn.classList.add('animate-mic-glow');
            cityInput.placeholder = 'Listening...';
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            cityInput.value = transcript.trim();
            getWeather();
        };

        recognition.onend = () => {
            voiceSearchBtn.classList.remove('animate-mic-glow');
            cityInput.placeholder = 'Enter city, country...';
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            showError(`Speech recognition failed: ${event.error}`);
            voiceSearchBtn.classList.remove('animate-mic-glow');
            cityInput.placeholder = 'Enter city, country...';
        };
    } else {
        voiceSearchBtn.style.display = 'none';
        console.warn('Web Speech API is not supported in this browser.');
    }
});

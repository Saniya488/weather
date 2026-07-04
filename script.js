// API Key Pool Management
const API_KEY_POOL = [
    '04a25b6616cd9d650bd9771e7862eb18', // Primary
    '3481df8d641d40ff4fe0c2017df716ec', // Backup 1
    '50c6096db8ca73f91040854c3022fc75'  // Backup 2
];

function getActiveApiKey() {
    const customKey = localStorage.getItem('custom_weather_api_key');
    if (customKey && customKey.trim().length > 10) {
        return customKey.trim();
    }
    // Return primary key
    return API_KEY_POOL[0];
}

// Global active key rotator in case of rate limit limits
let currentPoolIndex = 0;
function rotateApiKey() {
    const customKey = localStorage.getItem('custom_weather_api_key');
    if (customKey) return; // Never rotate if the user entered their own key
    currentPoolIndex = (currentPoolIndex + 1) % API_KEY_POOL.length;
    console.log(`Rotated key to pool index: ${currentPoolIndex}`);
}

// Map direct country searches directly to their capital city to prevent empty city geocoding lookups
const countryCapitalMap = {
    'australia': { city: 'Canberra', country: 'AU' },
    'austria': { city: 'Vienna', country: 'AT' },
    'canada': { city: 'Ottawa', country: 'CA' },
    'germany': { city: 'Berlin', country: 'DE' },
    'france': { city: 'Paris', country: 'FR' },
    'india': { city: 'New Delhi', country: 'IN' },
    'japan': { city: 'Tokyo', country: 'JP' },
    'united kingdom': { city: 'London', country: 'GB' },
    'uk': { city: 'London', country: 'GB' },
    'united states': { city: 'Washington', country: 'US' },
    'usa': { city: 'Washington', country: 'US' },
    'nigeria': { city: 'Abuja', country: 'NG' },
    'brazil': { city: 'Brasilia', country: 'BR' },
    'china': { city: 'Beijing', country: 'CN' },
    'spain': { city: 'Madrid', country: 'ES' },
    'italy': { city: 'Rome', country: 'IT' },
    'mexico': { city: 'Mexico City', country: 'MX' },
    'russia': { city: 'Moscow', country: 'RU' },
    'south korea': { city: 'Seoul', country: 'KR' },
    'egypt': { city: 'Cairo', country: 'EG' },
    'new zealand': { city: 'Wellington', country: 'NZ' },
    'south africa': { city: 'Pretoria', country: 'ZA' }
};

async function getWeather(location = null, selectedCity = null) {
    const cityInput = document.getElementById('city-input');
    let input = '';
    
    if (cityInput && typeof cityInput.value === 'string') {
        input = cityInput.value.trim();
    }

    // Handle geolocation object passes or fallback overrides
    if (location && location.coords) {
        input = `lat:${location.coords.latitude},lon:${location.coords.longitude}`;
    } else if (location && typeof location === 'string') {
        input = location;
    }

    const originalInput = input || 'Current Location';
    const apiKey = getActiveApiKey();

    const loading = document.getElementById('loading');
    const weatherInfo = document.getElementById('weather-info');
    const forecastSection = document.getElementById('forecast');
    const hourlySection = document.getElementById('hourly');
    const errorDiv = document.getElementById('error');
    const alertsDiv = document.getElementById('alerts');
    const welcomeDiv = document.getElementById('welcome');
    const suggestionsDiv = document.getElementById('suggestions');
    const cityLocation = document.getElementById('city-location');

    if (!input) {
        showError('Please enter a city name (e.g., London, GB), use the Detect Location button, or enter coordinates.');
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
    const isManualInput = !location && input.trim().length > 0;

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

    // A slightly longer timeout of 12 seconds to support slower internet configurations
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), 12000);
    });

    try {
        if (input.startsWith('lat:') && input.includes('lon:')) {
            // Coordinate Lookup Path
            const cleanCoords = input.replace('lat:', '').replace('lon:', '');
            const parts = cleanCoords.split(',');
            if (parts.length >= 2) {
                lat = parseFloat(parts[0].trim());
                lon = parseFloat(parts[1].trim());
                if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    throw new Error('Invalid coordinates range. Latitude must be between -90 and 90, Longitude between -180 and 180.');
                }
                displayName = `Coordinates: ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
            } else {
                throw new Error('Invalid coordinate structure. Use format "lat:40.7,lon:-74.0".');
            }
        } else {
            // Text Lookup Path
            let searchInput = input.replace(/\s*,\s*/g, ',').trim();
            const parts = searchInput.split(',');
            let city = parts[0].trim();
            let country = parts[1] ? parts[1].trim().toLowerCase() : '';

            // Dynamically resolve country name searches to their capital city
            const lowerCity = city.toLowerCase();
            if (!country && countryCapitalMap[lowerCity]) {
                const resolved = countryCapitalMap[lowerCity];
                city = resolved.city;
                country = resolved.country;
            }

            if (country) {
                const normalizedCountryCode = country.toUpperCase();
                if (countryCodes.includes(normalizedCountryCode)) {
                    country = normalizedCountryCode;
                } else {
                    const mappedCountry = countryMap[country.toLowerCase()];
                    if (mappedCountry) {
                        country = mappedCountry;
                    } else {
                        throw new Error('Invalid country. Use a two-letter code (e.g., US, GB, IN, NG) or country name.');
                    }
                }
            }
            
            const query = country ? `${city},${country}` : city;
            let geoData = [];
            let geoSuccess = false;

            // Step 1: Query Geocoding with absolute safety
            try {
                const geocodingUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${apiKey}`;
                const geoResponse = await Promise.race([fetch(geocodingUrl), timeoutPromise]);
                
                if (geoResponse.ok) {
                    geoData = await geoResponse.json();
                    geoSuccess = true;
                } else if (geoResponse.status === 401) {
                    throw new Error('KEY_SUSPENDED');
                }
            } catch (err) {
                if (err.message === 'KEY_SUSPENDED') throw err;
                console.warn("Geocoding service timed out or failed. Switching to direct text weather API...", err);
            }

            // Step 2: Fallback logic directly querying by text input query
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
                    throw new Error("Unable to retrieve forecast calculations for this city.");
                }
            } else {
                // Primary path success: Geocoding coordinates matched
                const selected = selectedCity ? geoData.find(c => `${c.name}, ${c.country}` === selectedCity) : geoData[0];
                if (!selected) {
                    throw new Error(`Unable to find a match for "${query}".`);
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
        }

        // Fetch Weather info using Lat/Lon if not already pulled via direct fallback text search
        if (!weatherDataFromAPI) {
            const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
            const weatherResponse = await Promise.race([fetch(weatherUrl), timeoutPromise]);
            if (!weatherResponse.ok) {
                handleHttpErrors(weatherResponse);
            }
            weatherDataFromAPI = await weatherResponse.json();
        }

        // Fetch Air Pollution Info
        const airQualityUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
        const airQualityResponse = await Promise.race([fetch(airQualityUrl), timeoutPromise]);
        const airQualityData = airQualityResponse.ok ? await airQualityResponse.json() : { list: [{ main: { aqi: 'N/A' } }] };

        // Fetch 5-day Forecast using Lat/Lon if not already populated via fallback direct text query
        if (!forecastData) {
            const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
            const forecastResponse = await Promise.race([fetch(forecastUrl), timeoutPromise]);
            if (!forecastResponse.ok) {
                handleHttpErrors(forecastResponse);
            }
            forecastData = await forecastResponse.json();
        }

        // Populate Weather Alerts if any exist inside the payload
        let alertMessage = '';
        if (weatherDataFromAPI.alerts && weatherDataFromAPI.alerts.length > 0) {
            alertMessage = weatherDataFromAPI.alerts.map(alert => `${alert.event}: ${alert.description}`).join(' | ');
            alertsDiv.textContent = `Weather Alerts: ${alertMessage}`;
            alertsDiv.classList.remove('hidden');
        }

        // DOM Updates & Binding
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

        // Populate Hourly Container
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

        // Populate 5-day Forecast Container
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
        
        // If query with active key timed out, automatically rotate pool if using system keys
        if (error.message === 'TIMEOUT' || error.message === 'KEY_SUSPENDED') {
            rotateApiKey();
        }

        if (error.message === 'TIMEOUT') {
            showError('The request timed out. This is usually caused by network issues, VPNs, ad-blockers blocking "openweathermap.org", or key suspension. Try configuring your own free API key in the settings ⚙️ menu!');
        } else if (error.message === 'KEY_SUSPENDED') {
            showError('API Key inactive or suspended. Public exposed keys on GitHub are automatically disabled. To resolve, click the settings ⚙️ button to add your own free OpenWeatherMap API Key.');
        } else {
            showError(error.message);
        }
    }
}

function handleHttpErrors(response) {
    if (response.status === 401) {
        throw new Error('KEY_SUSPENDED');
    } else if (response.status === 429) {
        throw new Error('API rate limit reached. Please try again shortly.');
    } else if (response.status === 404) {
        throw new Error('Location not found. Please verify the spelling or add a country code (e.g. Rome, IT).');
    } else {
        throw new Error(`Weather system error code: ${response.status}`);
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
    
    errorDiv.innerHTML = `<span class="font-bold">Error:</span> ${message}`;
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
    const apiKey = getActiveApiKey();
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

// Setup and wire DOM events
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
    const locateBtn = document.getElementById('locate-btn');
    
    // Settings elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const saveSettings = document.getElementById('save-settings');
    const resetApiKey = document.getElementById('reset-api-key');
    const apiKeyInput = document.getElementById('api-key-input');
    const apiKeyStatus = document.getElementById('api-key-status');

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

    // Key configuration initialization
    function updateKeyStatusUI() {
        const customKey = localStorage.getItem('custom_weather_api_key');
        if (customKey) {
            apiKeyInput.value = customKey;
            apiKeyStatus.textContent = 'Custom Active';
            apiKeyStatus.className = 'px-2.5 py-0.5 rounded-full bg-green-500 bg-opacity-20 text-green-300 border border-green-500 border-opacity-30 font-semibold';
        } else {
            apiKeyInput.value = '';
            apiKeyStatus.textContent = 'Using System Pool';
            apiKeyStatus.className = 'px-2.5 py-0.5 rounded-full bg-blue-500 bg-opacity-20 text-blue-300 border border-blue-500 border-opacity-30 font-semibold';
        }
    }

    // Settings listeners
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            updateKeyStatusUI();
            settingsModal.classList.remove('hidden');
        });
    }

    if (closeSettings) {
        closeSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }

    if (saveSettings) {
        saveSettings.addEventListener('click', () => {
            const val = apiKeyInput.value.trim();
            if (val.length > 0 && val.length < 15) {
                alert('That API Key seems too short. OpenWeatherMap keys are typically 32 characters long.');
                return;
            }
            if (val) {
                localStorage.setItem('custom_weather_api_key', val);
            } else {
                localStorage.removeItem('custom_weather_api_key');
            }
            settingsModal.classList.add('hidden');
            getWeather();
        });
    }

    if (resetApiKey) {
        resetApiKey.addEventListener('click', () => {
            localStorage.removeItem('custom_weather_api_key');
            apiKeyInput.value = '';
            updateKeyStatusUI();
        });
    }

    // Locate Me GPS Click Listener
    if (locateBtn) {
        locateBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                locateBtn.classList.add('animate-spin');
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        locateBtn.classList.remove('animate-spin');
                        getWeather(position);
                    },
                    (error) => {
                        locateBtn.classList.remove('animate-spin');
                        let geoErrMessage = 'Could not retrieve your location. ';
                        if (error.code === error.PERMISSION_DENIED) {
                            geoErrMessage += 'Location permissions denied. Please enable location permissions in your browser.';
                        } else {
                            geoErrMessage += error.message;
                        }
                        showError(geoErrMessage);
                    }
                );
            } else {
                showError('Geolocation is not supported by your browser.');
            }
        });
    }

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
                        li.className = 'p-3 cursor-pointer text-gray-800 bg-white hover:bg-blue-600 hover:text-white transition-all duration-150 rounded text-sm font-medium';
                        li.addEventListener('click', () => {
                            cityInput.value = suggestion.name;
                            suggestionsDiv.classList.add('hidden');
                            // Bypasses geocoding redundant calls by passing lat/lon coordinates directly
                            getWeather(`lat:${suggestion.lat},lon:${suggestion.lon}`);
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

    // Web Speech Voice configuration
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
            cityInput.placeholder = 'Enter city (e.g., Paris, FR)';
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            showError(`Speech recognition failed: ${event.error}`);
            voiceSearchBtn.classList.remove('animate-mic-glow');
            cityInput.placeholder = 'Enter city (e.g., Paris, FR)';
        };
    } else {
        voiceSearchBtn.style.display = 'none';
        console.warn('Web Speech API is not supported in this browser.');
    }
});

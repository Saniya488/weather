// --- PROXY CONFIGURATION AND API KEY ---
// WARNING: This public proxy method is prone to intermittent "Failed to fetch" errors.
// This is the simplest fix, but for 100% reliability, Cloudflare Worker is required.
const API_KEY = '04a25b6616cd9d650bd9771e7862eb18'; 
const OPENWEATHER_BASE = 'api.openweathermap.org'; 

// *** NEW, MORE RELIABLE PUBLIC PROXY URL ***
const PROXY_URL = 'https://cors-anywhere.herokuapp.com/'; 
// Note: This proxy requires a one-time click on its website to activate for the session:
// Visit https://cors-anywhere.herokuapp.com/ and click "Request temporary access to the demo server" 
// once before testing your deployed site.

// Helper functions to correctly wrap the OpenWeatherMap URL with the CORS proxy
function getProxiedUrl(endpoint) {
    const targetUrl = `https://${OPENWEATHER_BASE}/data/2.5/${endpoint}&appid=${API_KEY}`;
    return `${PROXY_URL}${targetUrl}`; // Cors-anywhere doesn't require encoding the target URL
}

function getProxiedGeoUrl(endpoint) {
     const targetUrl = `https://${OPENWEATHER_BASE}/geo/1.0/${endpoint}&appid=${API_KEY}`;
     return `${PROXY_URL}${targetUrl}`;
}

// --- GLOBAL DOM REFERENCES (Shortened for brevity) ---
const cityInput = document.getElementById('city-input');
const loading = document.getElementById('loading');
const weatherInfo = document.getElementById('weather-info');
const forecastSection = document.getElementById('forecast');
const hourlySection = document.getElementById('hourly');
const errorDiv = document.getElementById('error');
const alertsDiv = document.getElementById('alerts');
const welcomeDiv = document.getElementById('welcome');
const suggestionsDiv = document.getElementById('suggestions');
const cityLocation = document.getElementById('city-location');

function showError(message) {
    errorDiv.textContent = message;
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
    
    // Use Geo Proxy
    const endpoint = `direct?q=${encodeURIComponent(query)}&limit=5`;
    const proxiedUrl = getProxiedGeoUrl(endpoint);
    
    try {
        const response = await fetch(proxiedUrl);
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

async function getWeather(location = null, selectedCity = null) {
    const cityInput = document.getElementById('city-input');
    let input = (cityInput && typeof cityInput.value === 'string' ? cityInput.value.trim() : '') || location;
    const originalInput = input || 'Current Location';

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

    let lat, lon, weatherDataFromAPI, displayName = originalInput, locationDetails = '';
    const isManualInput = !location && (typeof input === 'string' && input.trim()) || selectedCity;

    const districtMapping = {
        'Hyderabad': 'Hyderabad District', 'Mumbai': 'Mumbai District', 'Delhi': 'Delhi District',
        'Bangalore': 'Bangalore Urban District', 'Chennai': 'Chennai District'
    };

    const countryCodes = ['US', 'GB', 'IN', 'JP', 'FR', 'DE', 'CA', 'AU', 'BR', 'CN', 'ES', 'IT', 'MX', 'RU', 'KR', 'NG'];

    const countryMap = {
        'united states': 'US', 'usa': 'US', 'united kingdom': 'GB', 'uk': 'GB', 'india': 'IN',
        'japan': 'JP', 'france': 'FR', 'germany': 'DE', 'canada': 'CA', 'australia': 'AU',
        'brazil': 'BR', 'china': 'CN', 'spain': 'ES', 'italy': 'IT', 'mexico': 'MX',
        'russia': 'RU', 'south korea': 'KR', 'nigeria': 'NG'
    };

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 10000);
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
            
            // --- PROXIED GEOCODING CALL ---
            const geocodingEndpoint = `direct?q=${encodeURIComponent(query)}&limit=5`;
            const geoResponse = await Promise.race([fetch(getProxiedGeoUrl(geocodingEndpoint)), timeoutPromise]);
            
            if (!geoResponse.ok) {
                const status = geoResponse.status;
                if (status === 401) {
                    throw new Error('Invalid API key. Please verify your OpenWeatherMap API key is correct.');
                } else if (status === 429) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                } else {
                    throw new Error(`Unable to find location "${query}". Check spelling or network connection.`);
                }
            }
            const geoData = await geoResponse.json();
            
            if (geoData.length === 0) {
                throw new Error(`No results for "${query}". Try a larger nearby city or check spelling.`);
            }
            if (geoData.length > 1 && !selectedCity && !country) {
                suggestionsDiv.innerHTML = '';
                suggestionsDiv.classList.remove('hidden');
                geoData.forEach(city => {
                    const suggestion = `${city.name}, ${city.country}`;
                    const li = document.createElement('li');
                    li.textContent = suggestion;
                    li.className = 'p-2 cursor-pointer text-gray-900 hover:bg-gray-300 bg-white';
                    li.addEventListener('click', () => {
                        cityInput.value = suggestion;
                        suggestionsDiv.classList.add('hidden');
                        getWeather(null, suggestion);
                    });
                    suggestionsDiv.appendChild(li);
                });
                loading.classList.add('hidden');
                return;
            }
            const selected = selectedCity ? geoData.find(city => `${city.name}, ${city.country}` === selectedCity) : geoData[0];
            if (!selected) {
                throw new Error(`No matching city found for "${query}". Try a larger nearby city.`);
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
        } else {
            throw new Error('Invalid input. Please enter a valid city name or coordinates.');
        }
        
        // --- PROXIED WEATHER & FORECAST CALLS ---
        const weatherEndpoint = `weather?lat=${lat}&lon=${lon}&units=metric`;
        const airQualityEndpoint = `air_pollution?lat=${lat}&lon=${lon}`;
        const forecastEndpoint = `forecast?lat=${lat}&lon=${lon}&units=metric`;
        
        const weatherResponse = await Promise.race([fetch(getProxiedUrl(weatherEndpoint)), timeoutPromise]);
        if (!weatherResponse.ok) {
            throw new Error(`Weather API error (${weatherResponse.status}).`);
        }
        weatherDataFromAPI = await weatherResponse.json();

        const airQualityResponse = await Promise.race([fetch(getProxiedUrl(airQualityEndpoint)), timeoutPromise]);
        const airQualityData = airQualityResponse.ok ? await airQualityResponse.json() : { list: [{ main: { aqi: 'N/A' } }] };

        const forecastResponse = await Promise.race([fetch(getProxiedUrl(forecastEndpoint)), timeoutPromise]);
        if (!forecastResponse.ok) {
            throw new Error('Forecast data unavailable. Try a different location.');
        }
        const forecastData = await forecastResponse.json();

        // --- DISPLAY LOGIC ---
        
        let alertMessage = '';
        if (weatherDataFromAPI.alerts && weatherDataFromAPI.alerts.length > 0) {
            alertMessage = weatherDataFromAPI.alerts.map(alert => `${alert.event}: ${alert.description}`).join(' | ');
            alertsDiv.textContent = `Weather Alerts: ${alertMessage}`;
            alertsDiv.classList.remove('hidden');
        }

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

        const weatherDescription = weatherDataFromAPI.weather[0].description.toLowerCase();
        let weatherMainClass = 'default';

        if (weatherDescription.includes('rain') || weatherDescription.includes('shower')) {
            weatherMainClass = 'rain';
        } else if (weatherDescription.includes('cloud')) {
            weatherMainClass = 'clouds';
        } else if (weatherDescription.includes('clear')) {
            weatherMainClass = 'clear';
        } else if (weatherDescription.includes('snow')) {
            weatherMainClass = 'snow';
        }

        // Apply the relevant class for background image change
        document.body.className = `flex flex-col min-h-screen ${weatherMainClass} bg-fixed font-inter transition-background duration-500`;

        const hourlyContainer = document.getElementById('hourly-container');
        hourlyContainer.innerHTML = '';
        const hourlyData = forecastData.list.slice(0, 8);
        hourlyData.forEach((hour) => {
            const time = new Date(hour.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const card = `
                <div class="hourly-card bg-white bg-opacity-10 p-2 rounded-lg">
                    <p class="font-medium">${time}</p>
                    <img src="https://openweathermap.org/img/wn/${hour.weather[0].icon}@2x.png" alt="Hourly icon" class="w-8 h-8 mx-auto weather-icon-extra">
                    <p>${Math.round(hour.main.temp)}°C</p>
                    <p class="text-sm">Precip: ${Math.round(hour.pop * 100)}%</p>
                </div>
            `;
            hourlyContainer.insertAdjacentHTML('beforeend', card);
        });

        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = '';
        const dailyData = forecastData.list.filter(item => item.dt_txt.includes('12:00:00'));
        dailyData.slice(0, 5).forEach((day) => {
            const date = new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const card = `
                <div class="forecast-card bg-white bg-opacity-10 p-2 rounded-lg">
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
        showError(error.message);
    }
}

// --- DOM Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    const cityInput = document.getElementById('city-input');

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
                        li.className = 'p-2 cursor-pointer text-gray-900 hover:bg-gray-300 bg-white'; 
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
            cityInput.placeholder = 'Enter cityat}&lon=${lon}&units=metric`;
        
        const weatherResponse = await Promise.race([fetch(getProxiedUrl(weatherEndpoint)), timeoutPromise]);
        if (!weatherResponse.ok) {
            throw new Error(`Weather API error (${weatherResponse.status}).`);
        }
        weatherDataFromAPI = await weatherResponse.json();

        const airQualityResponse = await Promise.race([fetch(getProxiedUrl(airQualityEndpoint)), timeoutPromise]);
        const airQualityData = airQualityResponse.ok ? await airQualityResponse.json() : { list: [{ main: { aqi: 'N/A' } }] };

        const forecastResponse = await Promise.race([fetch(getProxiedUrl(forecastEndpoint)), timeoutPromise]);
        if (!forecastResponse.ok) {
            throw new Error('Forecast data unavailable. Try a different location.');
        }
        const forecastData = await forecastResponse.json();

        // --- DISPLAY LOGIC ---
        
        let alertMessage = '';
        if (weatherDataFromAPI.alerts && weatherDataFromAPI.alerts.length > 0) {
            alertMessage = weatherDataFromAPI.alerts.map(alert => `${alert.event}: ${alert.description}`).join(' | ');
            alertsDiv.textContent = `Weather Alerts: ${alertMessage}`;
            alertsDiv.classList.remove('hidden');
        }

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

        const weatherDescription = weatherDataFromAPI.weather[0].description.toLowerCase();
        let weatherMainClass = 'default';

        if (weatherDescription.includes('rain') || weatherDescription.includes('shower')) {
            weatherMainClass = 'rain';
        } else if (weatherDescription.includes('cloud')) {
            weatherMainClass = 'clouds';
        } else if (weatherDescription.includes('clear')) {
            weatherMainClass = 'clear';
        } else if (weatherDescription.includes('snow')) {
            weatherMainClass = 'snow';
        }

        // Apply the relevant class for background image change
        document.body.className = `flex flex-col min-h-screen ${weatherMainClass} bg-fixed font-inter transition-background duration-500`;

        const hourlyContainer = document.getElementById('hourly-container');
        hourlyContainer.innerHTML = '';
        const hourlyData = forecastData.list.slice(0, 8);
        hourlyData.forEach((hour) => {
            const time = new Date(hour.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const card = `
                <div class="hourly-card bg-white bg-opacity-10 p-2 rounded-lg">
                    <p class="font-medium">${time}</p>
                    <img src="https://openweathermap.org/img/wn/${hour.weather[0].icon}@2x.png" alt="Hourly icon" class="w-8 h-8 mx-auto weather-icon-extra">
                    <p>${Math.round(hour.main.temp)}°C</p>
                    <p class="text-sm">Precip: ${Math.round(hour.pop * 100)}%</p>
                </div>
            `;
            hourlyContainer.insertAdjacentHTML('beforeend', card);
        });

        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = '';
        const dailyData = forecastData.list.filter(item => item.dt_txt.includes('12:00:00'));
        dailyData.slice(0, 5).forEach((day) => {
            const date = new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const card = `
                <div class="forecast-card bg-white bg-opacity-10 p-2 rounded-lg">
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
        showError(error.message);
    }
}

// --- DOM Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    const cityInput = document.getElementById('city-input');

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
                        li.className = 'p-2 cursor-pointer text-gray-900 hover:bg-gray-300 bg-white'; 
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
            cityInput.placeholder = 'Enter cityedUrl(airQualityEndpoint)), timeoutPromise]);
        const airQualityData = airQualityResponse.ok ? await airQualityResponse.json() : { list: [{ main: { aqi: 'N/A' } }] };

        const forecastResponse = await Promise.race([fetch(getProxiedUrl(forecastEndpoint)), timeoutPromise]);
        if (!forecastResponse.ok) {
            throw new Error('Forecast data unavailable. Try a different location.');
        }
        const forecastData = await forecastResponse.json();

        // --- DISPLAY LOGIC ---
        
        let alertMessage = '';
        if (weatherDataFromAPI.alerts && weatherDataFromAPI.alerts.length > 0) {
            alertMessage = weatherDataFromAPI.alerts.map(alert => `${alert.event}: ${alert.description}`).join(' | ');
            alertsDiv.textContent = `Weather Alerts: ${alertMessage}`;
            alertsDiv.classList.remove('hidden');
        }

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

        const weatherDescription = weatherDataFromAPI.weather[0].description.toLowerCase();
        let weatherMainClass = 'default';

        if (weatherDescription.includes('rain') || weatherDescription.includes('shower')) {
            weatherMainClass = 'rain';
        } else if (weatherDescription.includes('cloud')) {
            weatherMainClass = 'clouds';
        } else if (weatherDescription.includes('clear')) {
            weatherMainClass = 'clear';
        } else if (weatherDescription.includes('snow')) {
            weatherMainClass = 'snow';
        }

        // Apply the relevant class for background image change
        document.body.className = `flex flex-col min-h-screen ${weatherMainClass} bg-fixed font-inter transition-background duration-500`;

        const hourlyContainer = document.getElementById('hourly-container');
        hourlyContainer.innerHTML = '';
        const hourlyData = forecastData.list.slice(0, 8);
        hourlyData.forEach((hour) => {
            const time = new Date(hour.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const card = `
                <div class="hourly-card bg-white bg-opacity-10 p-2 rounded-lg">
                    <p class="font-medium">${time}</p>
                    <img src="https://openweathermap.org/img/wn/${hour.weather[0].icon}@2x.png" alt="Hourly icon" class="w-8 h-8 mx-auto weather-icon-extra">
                    <p>${Math.round(hour.main.temp)}°C</p>
                    <p class="text-sm">Precip: ${Math.round(hour.pop * 100)}%</p>
                </div>
            `;
            hourlyContainer.insertAdjacentHTML('beforeend', card);
        });

        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = '';
        const dailyData = forecastData.list.filter(item => item.dt_txt.includes('12:00:00'));
        dailyData.slice(0, 5).forEach((day) => {
            const date = new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const card = `
                <div class="forecast-card bg-white bg-opacity-10 p-2 rounded-lg">
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
        showError(error.message);
    }
}

// --- DOM Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    const cityInput = document.getElementById('city-input');

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
                        li.className = 'p-2 cursor-pointer text-gray-900 hover:bg-gray-300 bg-white'; 
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
        // If speech API not supported, hide the button and log a warning
        if (voiceSearchBtn) {
            voiceSearchBtn.style.display = 'none';
        }
        console.warn('Web Speech API is not supported in this browser.');
    }
});

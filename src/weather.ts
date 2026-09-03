export interface WeatherContext {
  city: string;
  description: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  updatedAt: number;
}

interface GeocodingResponse {
  results?: Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number }>;
}

interface ForecastResponse {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
  };
}

const descriptionForCode = (code: number) => {
  if (code === 0) return "晴朗";
  if (code <= 3) return "多云";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 67) return "下雨";
  if (code >= 71 && code <= 77) return "下雪";
  if (code >= 80 && code <= 82) return "有阵雨";
  if (code >= 85 && code <= 86) return "有阵雪";
  if (code >= 95) return "有雷雨";
  return "天气平静";
};

export async function fetchWeather(city: string): Promise<WeatherContext> {
  const query = city.trim();
  if (!query) throw new Error("请先填写天气城市。");
  const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=zh&format=json`);
  if (!geoResponse.ok) throw new Error("城市查询失败。");
  const geo = await geoResponse.json() as GeocodingResponse;
  const place = geo.results?.[0];
  if (!place) throw new Error("没有找到这个城市。");
  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("timezone", "auto");
  const forecastResponse = await fetch(forecastUrl);
  if (!forecastResponse.ok) throw new Error("天气更新失败。");
  const forecast = await forecastResponse.json() as ForecastResponse;
  if (!forecast.current) throw new Error("天气数据暂时不可用。");
  return {
    city: [place.name, place.admin1, place.country].filter(Boolean).join(" · "),
    description: descriptionForCode(forecast.current.weather_code),
    temperature: forecast.current.temperature_2m,
    apparentTemperature: forecast.current.apparent_temperature,
    humidity: forecast.current.relative_humidity_2m,
    windSpeed: forecast.current.wind_speed_10m,
    weatherCode: forecast.current.weather_code,
    updatedAt: Date.now(),
  };
}

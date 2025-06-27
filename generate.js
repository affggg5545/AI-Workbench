// api/generate.js - Наша безопасная серверлес-функция

export const config = {
    runtime: 'edge', // Используем быстрый Edge Runtime от Vercel
};

export default async function handler(req) {
    // Получаем параметры из URL запроса от нашего фронтенда
    const urlParams = new URL(req.url).searchParams;
    const prompt = urlParams.get('prompt');
    const model = urlParams.get('model');

    if (!prompt || !model) {
        return new Response('Missing prompt or model parameter', { status: 400 });
    }

    // Формируем URL к настоящему API Pollinations
    const apiUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&stream=true`;

    // Получаем наш секретный токен из переменных окружения Vercel
    const apiToken = process.env.POLLINATIONS_API_TOKEN;

    // Делаем запрос к Pollinations, но уже с заголовком авторизации
    const response = await fetch(apiUrl, {
        headers: {
            // Вот где мы безопасно используем токен!
            'Authorization': `Bearer ${apiToken}`
        }
    });

    // Возвращаем потоковый ответ от Pollinations напрямую нашему фронтенду
    return new Response(response.body, {
        headers: {
            'Content-Type': 'text/event-stream',
        }
    });
}
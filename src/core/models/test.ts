
import { OpenAI } from "openai";


async function getWeather(latitude: string, longitude: string) {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`);
    const data = await response.json();
    return data.current.temperature_2m;
}



const openai = new OpenAI();

const tools = [{
    type: "function",
    name: "get_weather",
    description: "Get current temperature for provided coordinates in celsius.",
    parameters: {
        type: "object",
        properties: {
            latitude: { type: "number" },
            longitude: { type: "number" }
        },
        required: ["latitude", "longitude"],
        additionalProperties: false
    },
    strict: true
}];

const input = [
    {
        role: "user",
        content: "What's the weather like in Paris today?"
    }
];

const response = await openai.responses.create({
    model: "gpt-4o",
    input,
    tools,
});

const toolCall = response.output[0];
const args = JSON.parse(toolCall.arguments);

const result = await getWeather(args.latitude, args.longitude);

input.push(toolCall); // append model's function call message
input.push({                               // append result message
    type: "function_call_output",
    call_id: toolCall.call_id,
    output: result.toString()
});

const response2 = await openai.responses.create({
    model: "gpt-4o",
    input,
    tools,
    store: true,
});

console.log(response2.output_text)
// Queues a long text as a synthesis job, waits for it to finish, and saves its audio.
import {NeuronAI, WaitTimeoutError} from "@naiuz/sdk";

const client = new NeuronAI();
const text = "Bir bor ekan, bir yo'q ekan, qadim zamonda bir dono podsho yashagan ekan. ".repeat(10);

try {
    const job = await client.tts.jobs.createAndWait({text, voice_id: "kamron", language: "uz"}, {timeout: 10 * 60_000});
    if (job.status === "succeeded") {
        // A finished job's audio is kept for 24 hours: download it now.
        const audio = await client.tts.jobs.audio(job.id);
        await audio.save("story.wav");
        console.log(`Saved story.wav: ${String(job.cost)} UZS.`);
    } else {
        console.error(`The job failed: ${job.error?.code ?? "unknown"}.`);
    }
} catch (error) {
    if (!(error instanceof WaitTimeoutError)) throw error;
    console.log(`The job ${error.job.id} is still ${error.job.status}: fetch its audio later with tts.jobs.audio().`);
}

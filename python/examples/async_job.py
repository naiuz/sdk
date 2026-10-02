"""Queues a long text as a synthesis job, waits for it to finish, and saves its audio."""

from naiuz import NeuronAI, WaitTimeoutError

client = NeuronAI()
text = "Bir bor ekan, bir yo'q ekan, qadim zamonda bir dono podsho yashagan ekan. " * 10

try:
    job = client.tts.jobs.create_and_wait(text=text, voice_id="kamron", language="uz", timeout=10 * 60)
except WaitTimeoutError as error:
    print(f"The job {error.job.id} is still {error.job.status}: fetch its audio later with tts.jobs.audio().")
else:
    if job.status == "succeeded":
        # A finished job's audio is kept for 24 hours: download it now.
        client.tts.jobs.audio(job.id).save("story.wav")
        print(f"Saved story.wav: {job.cost} UZS.")
    else:
        print(f"The job failed: {job.error.code if job.error else 'unknown'}.")

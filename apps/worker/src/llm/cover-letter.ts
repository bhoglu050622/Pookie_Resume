import { gemini, MODELS } from "./client.js";

export async function generateCoverLetter(opts: {
  jobTitle: string;
  jobCompany: string;
  jobDescription: string;
  resumeText: string;
  candidateName: string;
}): Promise<string> {
  const sys = `You write short, warm, specific cover-letter notes for LinkedIn Easy Apply. ~80 words. First person. No clichés ("highly motivated", "team player"). Open with one specific reason this role is a fit, mid with one concrete experience from the resume, close with a forward-looking line. No "Dear Hiring Manager", no signature — just the body. Plain text, no formatting.`;

  const prompt = `Candidate: ${opts.candidateName}
Resume excerpt:
${opts.resumeText.slice(0, 2500)}

Job:
Title: ${opts.jobTitle} @ ${opts.jobCompany}
Description: ${opts.jobDescription.slice(0, 2500)}

Write the note now.`;

  const resp = await gemini().models.generateContent({
    model: MODELS.cover,
    contents: prompt,
    config: {
      systemInstruction: sys,
      temperature: 0.6,
      maxOutputTokens: 300,
      // Small thinking budget — taste matters here, but not enough to spend big.
      thinkingConfig: { thinkingBudget: 256 },
    },
  });
  return (resp.text ?? "").trim();
}

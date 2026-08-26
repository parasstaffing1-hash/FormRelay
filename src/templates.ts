import { FormSchemaV2, Block } from "./blocks";

export type TemplateKey = "blank" | "contact" | "feedback" | "job" | "rsvp" | "nps" | "project" | "registration" | "consent";
export const TEMPLATE_OPTIONS: { key: TemplateKey; label: string; description: string }[] = [
  { key: "blank", label: "Blank form", description: "Start from an empty schema." },
  { key: "contact", label: "Contact us", description: "Name, email, topic, and message." },
  { key: "feedback", label: "Feedback survey", description: "Rating and written feedback." },
  { key: "job", label: "Job application", description: "Candidate details, role, and résumé." },
  { key: "rsvp", label: "Event RSVP", description: "Attendance, guest count, and dietary needs." },
  { key: "nps", label: "NPS survey", description: "0–10 recommendation score and follow-up." },
  { key: "project", label: "Project request", description: "Brief, budget, timeline, and contact." },
  { key: "registration", label: "Registration", description: "Participant details and preferences." },
  { key: "consent", label: "Consent form", description: "Acknowledgement and signature-style text." },
];

function block(id: string, type: Block["type"], label: string, extra: Partial<Block> = {}): Block {
  return { id, type, label, page_id: "page_1", required: false, ...extra };
}
function schema(blocks: Block[], submitText = "Submit"): FormSchemaV2 {
  return { version: 2, blocks, settings: { submitText, successMessage: "Thank you — your response has been received.", redirectUrl: "", progressStyle: "bar", conversational: false }, pages: [{ id: "page_1", title: "Page 1" }], variables: [], logic: [], endings: [] };
}

export function templateSchema(key: TemplateKey): FormSchemaV2 {
  if (key === "contact") return schema([
    block("contact_name", "short_text", "Full name", { required: true }),
    block("contact_email", "email", "Email address", { required: true }),
    block("contact_topic", "select", "What can we help with?", { options: ["General question", "Support", "Partnership", "Other"], required: true }),
    block("contact_message", "long_text", "Message", { required: true, placeholder: "How can we help?" }),
  ], "Send message");
  if (key === "feedback") return schema([
    block("feedback_rating", "rating", "How would you rate your experience?", { required: true }),
    block("feedback_area", "radio", "What did you use?", { options: ["Product", "Support", "Documentation", "Other"] }),
    block("feedback_comment", "long_text", "What could we improve?"),
    block("feedback_email", "email", "Email for follow-up"),
  ], "Send feedback");
  if (key === "job") return schema([
    block("job_name", "short_text", "Full name", { required: true }),
    block("job_email", "email", "Email address", { required: true }),
    block("job_role", "select", "Role applying for", { options: ["Engineering", "Design", "Operations", "Sales", "Other"], required: true }),
    block("job_summary", "long_text", "Tell us about yourself", { required: true }),
    block("job_resume", "file", "Résumé / CV", { required: true, accept: ".pdf,.doc,.docx" }),
  ], "Apply");
  if (key === "rsvp") return schema([
    block("rsvp_name", "short_text", "Guest name", { required: true }),
    block("rsvp_attending", "radio", "Will you attend?", { options: ["Yes", "No"], required: true }),
    block("rsvp_guests", "number", "Number of guests", { min: 1, max: 10 }),
    block("rsvp_diet", "checkbox_choice", "Dietary requirements", { options: ["None", "Vegetarian", "Vegan", "Gluten-free", "Other"] }),
    block("rsvp_note", "long_text", "Anything else we should know?"),
  ], "RSVP");
  if (key === "nps") return schema([
    block("nps_score", "number", "How likely are you to recommend us to a friend? (0–10)", { min: 0, max: 10, required: true }),
    block("nps_reason", "long_text", "What is the main reason for your score?", { required: true }),
    block("nps_email", "email", "Email address (optional)"),
  ], "Submit score");
  if (key === "project") return schema([
    block("project_name", "short_text", "Your name", { required: true }),
    block("project_email", "email", "Work email", { required: true }),
    block("project_type", "select", "Project type", { options: ["Website", "Application", "Automation", "Consulting", "Other"], required: true }),
    block("project_budget", "select", "Estimated budget", { options: ["Under $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Not sure"] }),
    block("project_brief", "long_text", "Project brief", { required: true }),
    block("project_deadline", "date", "Target date"),
  ], "Request proposal");
  if (key === "registration") return schema([
    block("reg_name", "short_text", "Full name", { required: true }),
    block("reg_email", "email", "Email address", { required: true }),
    block("reg_company", "short_text", "Company / organisation"),
    block("reg_role", "short_text", "Role or job title"),
    block("reg_preferences", "checkbox_choice", "Topics of interest", { options: ["Product updates", "Events", "Research", "Community"] }),
    block("reg_consent", "checkbox", "I agree to receive relevant updates.", { required: true }),
  ], "Register");
  if (key === "consent") return schema([
    block("consent_name", "short_text", "Full name", { required: true }),
    block("consent_text", "paragraph", "Please review the terms provided by the organiser before confirming your consent."),
    block("consent_agree", "checkbox", "I have read and agree to the terms.", { required: true }),
    block("consent_notes", "long_text", "Notes or questions"),
  ], "Confirm consent");
  return schema([]);
}

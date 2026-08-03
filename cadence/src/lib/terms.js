// Terminology that adapts to how a studio uses Huddle.
// Stored in org.settings.usage: "consultancy" | "internal" | "both" | "other".
export const USAGE_OPTIONS = [
  { key: "consultancy", label: "Consultancy / client work", blurb: "You track time and bill against external clients and their projects." },
  { key: "internal", label: "Internal tracking & scheduling", blurb: "You plan your own team's work — no external clients." },
  { key: "both", label: "Both", blurb: "A mix of client work and internal projects." },
  { key: "other", label: "Something else", blurb: "Tell us in the box and we'll keep neutral wording." },
];

export function makeTerms(usage) {
  const u = usage || "consultancy";
  if (u === "internal") {
    return {
      usage: u,
      client: "Team", clients: "Teams", clientLower: "team", clientsLower: "teams",
      project: "Project", projects: "Projects", projectLower: "project", projectsLower: "projects",
      navProjects: "Teams & projects",
    };
  }
  // consultancy / both / other → client-facing wording
  return {
    usage: u,
    client: "Client", clients: "Clients", clientLower: "client", clientsLower: "clients",
    project: "Project", projects: "Projects", projectLower: "project", projectsLower: "projects",
    navProjects: "Clients & projects",
  };
}

import type { PersonalInfo } from "@/types/resume";
import { emptyPersonalInfo } from "@/types/resume";

const PROFILE_KEY = "codeshelf.resume.profile.v1";

export function loadResumeProfile(fallback?: PersonalInfo): PersonalInfo {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return normalizePersonalInfo(fallback);
    return normalizePersonalInfo(JSON.parse(raw));
  } catch {
    return normalizePersonalInfo(fallback);
  }
}

export function saveResumeProfile(profile: PersonalInfo): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizePersonalInfo(profile)));
}

export function hasResumeProfileContent(profile: PersonalInfo | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    profile.summary?.trim()
      || Object.values(profile.basic).some(Boolean)
      || profile.educations.some((item) => Boolean(item.school || item.degree || item.startDate || item.endDate))
      || Object.values(profile.jobPreference).some(Boolean)
      || profile.social.websites?.some((item) => item.url.trim())
      || (profile.customFields ?? []).some((item) => Boolean(item.label.trim() || item.value.trim()))
      || profile.workExperiences.some((item) => Boolean(item.company || item.position || item.startDate || item.endDate || item.description)),
  );
}

function normalizePersonalInfo(value: unknown): PersonalInfo {
  if (!value || typeof value !== "object") return emptyPersonalInfo();
  const raw = value as Record<string, unknown>;
  const pick = (input: unknown, keys: string[]): Record<string, string> => {
    const output: Record<string, string> = {};
    if (!input || typeof input !== "object") return output;
    const object = input as Record<string, unknown>;
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) output[key] = value.trim();
    }
    return output;
  };
  const socialRaw = raw.social && typeof raw.social === "object" ? raw.social as Record<string, unknown> : {};
  const websites = Array.isArray(socialRaw.websites)
    ? socialRaw.websites
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item, index) => ({
          id: typeof item.id === "string" && item.id ? item.id : `website-${index}`,
          label: typeof item.label === "string" ? item.label.trim() : "",
          url: typeof item.url === "string" ? item.url.trim() : "",
        }))
        .filter((item) => item.url)
    : [];
  const social: PersonalInfo["social"] = {};
  if (websites.length) social.websites = websites;
  const customFields = Array.isArray(raw.customFields)
    ? raw.customFields
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item, index) => ({
          id: typeof item.id === "string" && item.id ? item.id : `field-${index}`,
          label: typeof item.label === "string" ? item.label.trim() : "",
          value: typeof item.value === "string" ? item.value.trim() : "",
        }))
        .filter((item) => item.label || item.value)
    : [];
  return {
    summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
    basic: pick(raw.basic, [
      "avatarUrl",
      "name",
      "phone",
      "email",
      "workExperience",
    ]) as PersonalInfo["basic"],
    educations: Array.isArray(raw.educations)
      ? raw.educations
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item, index) => ({
            id: typeof item.id === "string" && item.id ? item.id : `education-${index}`,
            school: typeof item.school === "string" ? item.school.trim() : undefined,
            degree: typeof item.degree === "string" ? item.degree.trim() : undefined,
            startDate: typeof item.startDate === "string" ? item.startDate.trim() : undefined,
            endDate: typeof item.endDate === "string" ? item.endDate.trim() : undefined,
          }))
      : [],
    jobPreference: pick(raw.jobPreference, [
      "expectedPosition",
      "expectedSalary",
    ]) as PersonalInfo["jobPreference"],
    social,
    customFields,
    workExperiences: Array.isArray(raw.workExperiences)
      ? raw.workExperiences
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item, index) => ({
            id: typeof item.id === "string" && item.id ? item.id : `work-${index}`,
            company: typeof item.company === "string" ? item.company.trim() : undefined,
            position: typeof item.position === "string" ? item.position.trim() : undefined,
            startDate: typeof item.startDate === "string" ? item.startDate.trim() : undefined,
            endDate: typeof item.endDate === "string" ? item.endDate.trim() : undefined,
            description: typeof item.description === "string" ? item.description.trim() : undefined,
          }))
      : [],
  };
}

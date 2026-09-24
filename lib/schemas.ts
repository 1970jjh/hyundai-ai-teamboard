import { z } from "zod";

export const STATUSES = ["todo", "doing", "done"] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;
export const MODELS = ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"] as const;

export const STATUS_LABEL: Record<Status, string> = { todo: "할 일", doing: "진행 중", done: "완료" };
export const PRIORITY_LABEL: Record<Priority, string> = { high: "높음", medium: "보통", low: "낮음" };
export const MODEL_LABEL: Record<Model, string> = {
  "gemini-3.7-flash": "Gemini 3.7 Flash (기본)",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
};

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Model = (typeof MODELS)[number];

const ymdOrEmpty = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const memberName = z.string().trim().min(1, "이름을 입력하세요").max(20, "이름은 20자 이내");

export const checkItemSchema = z.object({
  text: z.string().trim().min(1).max(100),
  done: z.boolean(),
});

const taskFields = {
  owner: memberName,
  title: z.string().trim().min(1, "제목을 입력하세요").max(80, "제목은 80자 이내"),
  due: ymdOrEmpty,
  priority: z.enum(PRIORITIES),
  category: z.string().trim().max(20),
  checklist: z.array(checkItemSchema).max(15),
  status: z.enum(STATUSES),
};

/** 새 카드 — 선택 항목은 기본값으로 채운다 */
export const taskInputSchema = z.object({
  ...taskFields,
  due: taskFields.due.default(""),
  priority: taskFields.priority.default("medium"),
  category: taskFields.category.default(""),
  checklist: taskFields.checklist.default([]),
  status: taskFields.status.default("todo"),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

/** 수정 — 보낸 항목만 바꾼다(기본값 없음) */
export const taskPatchSchema = z.object(taskFields).partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export type Task = TaskInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
};

export const settingsSchema = z.object({
  teamName: z.string(),
  members: z.array(z.string()),
  geminiKey: z.string(),
  model: z.enum(MODELS),
  sheetUrl: z.string(),
  passwordHash: z.string(),
  sessionSecret: z.string(),
});
export type Settings = z.infer<typeof settingsSchema>;

/** 테스트에서만 가짜 수신 서버 주소를 허용(SHEET_URL_PREFIX_FOR_TESTS) */
const sheetUrlPrefix = () => process.env.SHEET_URL_PREFIX_FOR_TESTS || "https://script.google.com/";

export const settingsPatchSchema = z.object({
  teamName: z.string().trim().min(1).max(30).optional(),
  members: z.array(memberName).max(50).optional(),
  geminiKey: z.string().trim().max(200).optional(),
  model: z.enum(MODELS).optional(),
  sheetUrl: z
    .string()
    .trim()
    .max(300)
    .refine((u) => u === "" || (URL.canParse(u) && u.startsWith(sheetUrlPrefix())), {
      message: "https://script.google.com/ 으로 시작하는 웹 앱 주소를 넣어 주세요",
    })
    .optional(),
});
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const passwordChangeSchema = z.object({
  password: z.string().min(6, "비밀번호는 6자 이상").max(64),
});

export const loginSchema = z.object({ password: z.string().min(1).max(64) });
export const quickTextSchema = z.object({ text: z.string().trim().min(2, "업무 내용을 입력하세요").max(300) });
export const ownerSchema = z.object({ owner: memberName });

/* ---------- AI 응답 스키마 (zod 검증 + Gemini responseJsonSchema) ---------- */

export const aiTaskSchema = z.object({
  title: z.string().min(1).max(80),
  due: ymdOrEmpty,
  priority: z.enum(PRIORITIES),
  category: z.string().max(20),
  checklist: z.array(z.string().min(1).max(100)).max(8),
});
export type AiTask = z.infer<typeof aiTaskSchema>;

export const weeklyReportSchema = z.object({
  achievements: z.array(z.string().min(1)).max(10),
  plans: z.array(z.string().min(1)).max(10),
  issues: z.array(z.string().min(1)).max(10),
});
export type WeeklyReport = z.infer<typeof weeklyReportSchema>;

export const teamReportSchema = z.object({
  headline: z.string().min(1).max(120),
  achievements: z.array(z.string().min(1)).max(10),
  bottlenecks: z.array(z.string().min(1)).max(10),
  redistribution: z.array(z.string().min(1)).max(10),
});
export type TeamReport = z.infer<typeof teamReportSchema>;

/** zod 오류를 사용자에게 보여 줄 한 줄 한국어로 */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message && !/^(Invalid|Too|Expected)/.test(issue.message) ? issue.message : "입력값을 확인해 주세요";
}

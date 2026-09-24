import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { calendarContext, weekRange } from "./dates";
import { checklistProgress, memberLoads, teamStats } from "./stats";
import {
  aiTaskSchema,
  teamReportSchema,
  weeklyReportSchema,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type AiTask,
  type Model,
  type Task,
  type TeamReport,
  type WeeklyReport,
} from "./schemas";

export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export const NO_KEY_MESSAGE = "AI 기능을 쓰려면 관리자에게 Gemini API 키 등록을 요청하세요.";

interface AiConfig {
  apiKey: string;
  model: Model;
}

function friendlyError(e: unknown): AiError {
  const text = String((e as { message?: string })?.message ?? e);
  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|401|403/i.test(text)) {
    return new AiError("Gemini API 키가 올바르지 않습니다. 관리자 설정에서 키를 확인하세요.", 400);
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return new AiError("AI 사용량이 잠시 초과되었습니다. 1분 뒤 다시 시도하세요.", 429);
  }
  if (/404|not found/i.test(text)) return new AiError("선택한 Gemini 모델을 사용할 수 없습니다. 관리자 설정에서 모델을 바꿔 보세요.", 400);
  return new AiError("AI 응답을 받지 못했습니다. 잠시 뒤 다시 시도하세요.");
}

const isRetryable = (e: unknown) => !(e instanceof AiError) || e.status >= 500;

/** JSON 스키마로 응답을 받아 zod 로 검증. 실패하면 1회 재시도. */
export async function generateJson<T>(config: AiConfig, prompt: string, schema: z.ZodType<T>): Promise<T> {
  if (!config.apiKey) throw new AiError(NO_KEY_MESSAGE, 400);
  const ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { timeout: 45_000 } });
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: config.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const parsed = schema.safeParse(JSON.parse(res.text ?? ""));
      if (parsed.success) return parsed.data;
      lastError = new AiError("AI 응답 형식이 올바르지 않습니다. 다시 시도하세요.");
    } catch (e) {
      lastError = e instanceof SyntaxError ? new AiError("AI 응답 형식이 올바르지 않습니다. 다시 시도하세요.") : friendlyError(e);
    }
    if (!isRetryable(lastError)) break;
  }
  throw lastError;
}

/* ---------- 프롬프트 ---------- */

export function taskPrompt(text: string, today: string): string {
  return `당신은 HR/HRD 팀의 업무 비서입니다. 팀원이 한 줄로 적은 업무를 업무 카드로 정리하세요.

${calendarContext(today)}

규칙
- title: 핵심 동작이 드러나는 짧은 한국어 제목(명사형, 30자 이내). 마감 표현은 제목에서 뺀다.
- due: 마감일을 위 달력으로 계산해 YYYY-MM-DD. "오늘"=${today}, "내일", "모레", "이번 주 금요일", "다음주 수요일", "월말" 등을 정확히 변환. 마감 언급이 없으면 "".
- priority: 마감이 3일 이내이거나 "급히/긴급/꼭" 등의 표현이면 high, 일반은 medium, 여유 있으면 low.
- category: 업무 분류 2~6자(예: 교육 운영, 교육 기획, 채용, 평가, 리더십, 조직문화, 행정).
- checklist: 실제로 해야 할 작은 실행 단계 2~5개(각 25자 이내, 동사로 끝맺기).

팀원 입력: """${text}"""`;
}

const taskLine = (t: Task) =>
  `- [${STATUS_LABEL[t.status]}] ${t.title} | 우선순위 ${PRIORITY_LABEL[t.priority]} | 마감 ${t.due || "없음"}` +
  (t.checklist.length ? ` | 체크리스트 ${checklistProgress(t)} (${t.checklist.map((c) => (c.done ? "✓" : "·") + c.text).join(", ")})` : "") +
  (t.completedAt ? ` | 완료일 ${t.completedAt.slice(0, 10)}` : "");

export function weeklyPrompt(owner: string, tasks: Task[], today: string): string {
  const [mon, sun] = weekRange(today);
  return `당신은 HR/HRD 팀원의 주간 업무보고 초안을 쓰는 비서입니다.
${owner}님의 업무 카드를 읽고 «실적 / 계획 / 이슈» 형식의 주간보고 초안을 작성하세요.

오늘: ${today}, 이번 주: ${mon} ~ ${sun}

규칙
- achievements(실적): 이번 주에 완료했거나 의미 있게 진척된 일. 사실만, 과장 금지.
- plans(계획): 진행 중·할 일 중 다음 주까지 할 일. 마감이 있으면 "(~M/D)"로 덧붙인다.
- issues(이슈): 마감 지남, 임박, 체크리스트 정체 등 도움이나 결정이 필요한 점. 없으면 빈 배열.
- 각 항목은 한 문장, 보고서 말투(~함, ~예정)로 간결하게. 카드에 없는 내용은 지어내지 않는다.

업무 카드
${tasks.length ? tasks.map(taskLine).join("\n") : "(등록된 카드 없음)"}`;
}

export function teamPrompt(teamName: string, members: string[], tasks: Task[], today: string): string {
  const stats = teamStats(tasks, today);
  const loads = memberLoads(tasks, members, today)
    .map((m) => `- ${m.name}: 할 일 ${m.todo}, 진행 중 ${m.doing}, 완료 ${m.done}, 지연 ${m.overdue}`)
    .join("\n");
  const byOwner = [...new Set(tasks.map((t) => t.owner))]
    .map((o) => `[${o}]\n${tasks.filter((t) => t.owner === o).map(taskLine).join("\n")}`)
    .join("\n");
  return `당신은 HR/HRD 팀장의 주간 운영 리포트를 쓰는 분석가입니다. ${teamName}의 전체 업무 카드를 읽고 리포트를 작성하세요.

${calendarContext(today)}

현황: 전체 ${stats.total}건, 할 일 ${stats.todo}, 진행 중 ${stats.doing}, 완료 ${stats.done}(완료율 ${stats.completionRate}%), 지연 ${stats.overdue}, 3일 내 임박 ${stats.soon}

인원별 부하
${loads || "(팀원 없음)"}

규칙
- headline: 이번 주 팀 상황을 한 문장(40자 이내)으로.
- achievements(성과): 완료·진척된 주요 업무 요약, 담당자 이름 포함.
- bottlenecks(병목): 지연·임박 카드, 한 사람에게 몰린 업무, 멈춘 체크리스트를 근거와 함께.
- redistribution(재분배 제안): 부하가 적은 사람이 도울 수 있는 구체적 제안(누가 → 누구의 어떤 일). 근거가 없으면 빈 배열.
- 카드에 없는 사실은 지어내지 않는다. 보고서 말투로 간결하게.

업무 카드(담당자별)
${byOwner || "(등록된 카드 없음)"}`;
}

/* ---------- 앱 기능 ---------- */

export const parseTask = (c: AiConfig, text: string, today: string): Promise<AiTask> =>
  generateJson(c, taskPrompt(text, today), aiTaskSchema);

export const writeWeeklyReport = (c: AiConfig, owner: string, tasks: Task[], today: string): Promise<WeeklyReport> =>
  generateJson(c, weeklyPrompt(owner, tasks, today), weeklyReportSchema);

export const writeTeamReport = (
  c: AiConfig,
  teamName: string,
  members: string[],
  tasks: Task[],
  today: string,
): Promise<TeamReport> => generateJson(c, teamPrompt(teamName, members, tasks, today), teamReportSchema);

const pingSchema = z.object({ ok: z.boolean() });
export async function testConnection(c: AiConfig): Promise<void> {
  await generateJson(c, '연결 확인입니다. {"ok": true} 를 돌려주세요.', pingSchema);
}

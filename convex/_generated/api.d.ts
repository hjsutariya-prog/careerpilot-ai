/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountRecovery from "../accountRecovery.js";
import type * as adminAccess from "../adminAccess.js";
import type * as ai_evals_tailoringEval from "../ai/evals/tailoringEval.js";
import type * as ai_evals_tailoringEvalCases from "../ai/evals/tailoringEvalCases.js";
import type * as ai_resumeBlocks from "../ai/resumeBlocks.js";
import type * as ai_tailoringGeminiConfig from "../ai/tailoringGeminiConfig.js";
import type * as ai_tailoringPrompt from "../ai/tailoringPrompt.js";
import type * as ai_tailoringSchema from "../ai/tailoringSchema.js";
import type * as ai_tailoringValidation from "../ai/tailoringValidation.js";
import type * as auth from "../auth.js";
import type * as connections from "../connections.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as gemini from "../gemini.js";
import type * as greenhouse from "../greenhouse.js";
import type * as greenhouseNormalization from "../greenhouseNormalization.js";
import type * as greenhouseRefresh from "../greenhouseRefresh.js";
import type * as greenhouseSources from "../greenhouseSources.js";
import type * as http from "../http.js";
import type * as jobActions from "../jobActions.js";
import type * as owner from "../owner.js";
import type * as preferences from "../preferences.js";
import type * as resumeDocuments from "../resumeDocuments.js";
import type * as resumeMatching from "../resumeMatching.js";
import type * as resumeProfiles from "../resumeProfiles.js";
import type * as resumes from "../resumes.js";
import type * as roleSummaries from "../roleSummaries.js";
import type * as roleSummaryRefresh from "../roleSummaryRefresh.js";
import type * as searchMatching from "../searchMatching.js";
import type * as searchScheduling from "../searchScheduling.js";
import type * as searches from "../searches.js";
import type * as sourceHealth from "../sourceHealth.js";
import type * as tailoredResumes from "../tailoredResumes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountRecovery: typeof accountRecovery;
  adminAccess: typeof adminAccess;
  "ai/evals/tailoringEval": typeof ai_evals_tailoringEval;
  "ai/evals/tailoringEvalCases": typeof ai_evals_tailoringEvalCases;
  "ai/resumeBlocks": typeof ai_resumeBlocks;
  "ai/tailoringGeminiConfig": typeof ai_tailoringGeminiConfig;
  "ai/tailoringPrompt": typeof ai_tailoringPrompt;
  "ai/tailoringSchema": typeof ai_tailoringSchema;
  "ai/tailoringValidation": typeof ai_tailoringValidation;
  auth: typeof auth;
  connections: typeof connections;
  credits: typeof credits;
  crons: typeof crons;
  gemini: typeof gemini;
  greenhouse: typeof greenhouse;
  greenhouseNormalization: typeof greenhouseNormalization;
  greenhouseRefresh: typeof greenhouseRefresh;
  greenhouseSources: typeof greenhouseSources;
  http: typeof http;
  jobActions: typeof jobActions;
  owner: typeof owner;
  preferences: typeof preferences;
  resumeDocuments: typeof resumeDocuments;
  resumeMatching: typeof resumeMatching;
  resumeProfiles: typeof resumeProfiles;
  resumes: typeof resumes;
  roleSummaries: typeof roleSummaries;
  roleSummaryRefresh: typeof roleSummaryRefresh;
  searchMatching: typeof searchMatching;
  searchScheduling: typeof searchScheduling;
  searches: typeof searches;
  sourceHealth: typeof sourceHealth;
  tailoredResumes: typeof tailoredResumes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

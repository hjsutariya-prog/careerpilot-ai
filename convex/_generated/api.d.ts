/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as connections from "../connections.js";
import type * as greenhouse from "../greenhouse.js";
import type * as greenhouseNormalization from "../greenhouseNormalization.js";
import type * as greenhouseRefresh from "../greenhouseRefresh.js";
import type * as greenhouseSources from "../greenhouseSources.js";
import type * as http from "../http.js";
import type * as jobActions from "../jobActions.js";
import type * as preferences from "../preferences.js";
import type * as resumes from "../resumes.js";
import type * as searches from "../searches.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  connections: typeof connections;
  greenhouse: typeof greenhouse;
  greenhouseNormalization: typeof greenhouseNormalization;
  greenhouseRefresh: typeof greenhouseRefresh;
  greenhouseSources: typeof greenhouseSources;
  http: typeof http;
  jobActions: typeof jobActions;
  preferences: typeof preferences;
  resumes: typeof resumes;
  searches: typeof searches;
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

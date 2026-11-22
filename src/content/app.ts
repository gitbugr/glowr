import type { Settings, SiteDef, SiteId } from "../shared/config";
import type { CaptionTracker, CueStore } from "./cues";
import type { DeepQuery } from "./dom";
import type { Recorder } from "./recorder";
import type { Panel } from "./ui/panel";

/** Everything the content script's parts share. */
export interface App {
  cfg: Settings;
  site: SiteId | null;
  siteDef: SiteDef | null;
  video: HTMLVideoElement | null;
  cues: CueStore;
  tracker: CaptionTracker;
  recorder: Recorder;
  query: DeepQuery;
  panel: Panel;
  /** False while the user has closed the panel. */
  active: boolean;
  /** An ad is playing in the main video. */
  ad: boolean;
  /** Remember a new subtitle selector for this site. */
  setSelector(sel: string): void;
  /** Hide the panel and stop recording until reopened. */
  close(): void;
}

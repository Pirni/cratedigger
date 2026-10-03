import type { AudioSource } from '../../modules/ytdlp/model.js';
import type { Track } from '../shared/model.js';

export interface DownloadTrackCommand {
  readonly userId: string;
  readonly spotifyUserId: string;
  readonly track: Track;
  readonly source: AudioSource;
}

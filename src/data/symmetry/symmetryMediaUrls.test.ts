import { describe, expect, it } from 'vitest';
import { bodyScanImage, bodyScanVideo, exerciseVideoSources, profilePicUrl, SYMMETRY_CDN } from './symmetryMediaUrls';

describe('symmetryMediaUrls', () => {
  it('resolves body scan videos per gender', () => {
    expect(bodyScanVideo('male')).toBe(`${SYMMETRY_CDN}/body_scan/animacion_bodyscan_final.mp4`);
    expect(bodyScanVideo('female')).toBe(`${SYMMETRY_CDN}/body_scan/girl_animacion_bodyscan_final.mp4`);
  });

  it('uses the "mech" file name for the female mesh layer', () => {
    expect(bodyScanImage('female', 'mesh')).toMatch(/bodyscan_girl_default_mech\.png$/);
    expect(bodyScanImage('male', 'muscle')).toMatch(/bodyscan_preview_muscle\.png$/);
  });

  it('wraps profile pictures into pfp1..pfp17 with the right extension', () => {
    expect(profilePicUrl(0)).toMatch(/pfp1\.jpg$/);
    expect(profilePicUrl(4)).toMatch(/pfp5\.jpeg$/);
    expect(profilePicUrl(16)).toMatch(/pfp17\.png$/);
    expect(profilePicUrl(17)).toMatch(/pfp1\.jpg$/);
  });

  it('lists local video first and only accepts Symmetry CDN remotes', () => {
    expect(exerciseVideoSources({ id: 7 }, 'front')).toEqual(['symmetry/exercise_videos/7/front.mp4']);
    expect(
      exerciseVideoSources({ id: 7, videoUrl: `${SYMMETRY_CDN}/video_angles/x.mp4` }, 'front'),
    ).toEqual(['symmetry/exercise_videos/7/front.mp4', `${SYMMETRY_CDN}/video_angles/x.mp4`]);
    expect(exerciseVideoSources({ videoUrl: 'https://evil.example/x.mp4' }, 'front')).toEqual([]);
  });
});

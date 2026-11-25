import { describe, expect, it } from 'vitest';

import { parseVideoLink } from './youtube.ts';

const ID = 'dQw4w9WgXcQ';
const PAGE = `https://www.youtube.com/watch?v=${ID}`;

describe('reading YouTube links', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=abc`,
    `https://youtu.be/${ID}?si=xyz`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `youtu.be/${ID}`,
    `  https://youtu.be/${ID}  `,
  ])('finds the video in %s', link => {
    expect(parseVideoLink(link)).toEqual({ ok: true, id: ID, url: PAGE });
  });

  it('finds the link in a text shared from the YouTube app', () => {
    expect(parseVideoLink(`Never Gonna Give You Up\nhttps://youtu.be/${ID}?si=abc`)).toEqual({ ok: true, id: ID, url: PAGE });
  });

  it('keeps only the video of a link into a playlist', () => {
    expect(parseVideoLink(`https://www.youtube.com/watch?v=${ID}&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG&index=3`)).toEqual({
      ok: true,
      id: ID,
      url: PAGE,
    });
  });

  it('refuses playlists', () => {
    expect(parseVideoLink('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toEqual({
      ok: false,
      reason: 'PLAYLIST_LINK',
    });
  });

  it.each([
    'https://www.youtube.com/@RickAstleyYT',
    'https://vimeo.com/123456',
    'https://www.youtube.com/watch?v=short',
    'not a link',
    'javascript:alert(1)',
    '',
  ])('refuses %s', link => {
    expect(parseVideoLink(link)).toEqual({ ok: false, reason: 'NOT_A_VIDEO_LINK' });
  });
});

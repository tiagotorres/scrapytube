import { describe, expect, it } from 'vitest';

import { checkCookies } from './cookies.ts';

const line = (domain: string, name: string) => [domain, 'TRUE', '/', 'TRUE', '1798761600', name, 'value'].join('\t');

describe('cookies.txt files', () => {
  it('counts the YouTube and Google cookies of a Netscape file', () => {
    const text = ['# Netscape HTTP Cookie File', '', line('.youtube.com', 'SID'), line('#HttpOnly_.youtube.com', 'HSID'), line('.google.com', 'NID'), line('.example.com', 'x')].join('\n');
    expect(checkCookies(text)).toEqual({ text: `${text}\n`, youtube: 3 });
  });

  it('adds the header some extensions leave out, and reads Windows line ends', () => {
    const result = checkCookies(`﻿${line('.youtube.com', 'SID')}\r\n${line('.youtube.com', 'HSID')}\r\n`);
    expect(result?.text).toBe(`# Netscape HTTP Cookie File\n${line('.youtube.com', 'SID')}\n${line('.youtube.com', 'HSID')}\n`);
    expect(result?.youtube).toBe(2);
  });

  it('refuses what is not a cookies.txt', () => {
    expect(checkCookies('[{"domain": ".youtube.com", "name": "SID"}]')).toBeNull();
    expect(checkCookies('# Netscape HTTP Cookie File\n')).toBeNull();
    expect(checkCookies('.youtube.com TRUE / TRUE 0 SID value')).toBeNull();
  });
});

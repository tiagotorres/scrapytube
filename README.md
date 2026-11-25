# ScrapyTube

A mobile-first web app to save YouTube videos and music to a NAS. Paste a link
(or share it from the YouTube app), choose **Video** or **Music**, pick a
folder, and the NAS downloads it with [yt-dlp](https://github.com/yt-dlp/yt-dlp).
It runs as a single Docker container, and speaks English, French and
Portuguese.

- **Video or music.** A video is saved as an MP4 that plays everywhere (H.264 and AAC, up to 1080p). Music is saved as an MP3 at the best quality, with its title, artist and a square cover.
- **Pick the folder.** Browse the media folder, go into any folder or create a new one. Each kind remembers where you saved it last time.
- **The channel's folder.** A switch saves into a folder named after the channel's handle: video `abc` + channel `@handle1` gives `media/abc/handle1/Video title.mp4`. On by default for videos, off for music.
- **Downloads in the background.** The NAS does the work: close the app and come back later. A few run at a time; each shows its progress, and can be stopped, tried again, or saved to the phone once done.
- **Share from YouTube.** On Android, once ScrapyTube is installed from the browser, it appears in the YouTube app's *Share* menu. On iPhone, a Shortcut does the same (see below).
- **Several people.** Each has their own account; everyone shares the media folder and sees all the downloads (and who asked for each).
- **yt-dlp stays up to date.** YouTube changes often; ScrapyTube updates its own yt-dlp once a day, or when you ask in *Settings → Downloader*.
- **When YouTube asks to confirm you're not a bot**, add YouTube cookies in *Settings → Downloader* (see below).

Only single videos: a playlist link is refused, and a link to a video inside a
playlist downloads that video only.

---

## Running it on a NAS

The image is built on a computer and loaded on the NAS, as for Arctir.

### 1. Build the image

```bash
yarn install
yarn docker:build                      # for an Intel/AMD NAS (linux/amd64)
PLATFORM=linux/arm64 yarn docker:build # for an ARM NAS
```

This bumps the patch version in `package.json`, checks the code (types and
tests), builds `scrapytube.tar`, then commits and pushes the version bump. The
repository needs a first commit before the first build.

### 2. Load it

Copy `scrapytube.tar` to the NAS, then in Portainer use *Images → Import*, or:

```bash
sudo docker load -i scrapytube.tar
```

### 3. Start it

A Portainer stack (adjust the paths, the user and the time zone):

```yaml
services:
  scrapytube:
    image: scrapytube:latest
    pull_policy: never # local image, never look for it on Docker Hub
    container_name: scrapytube
    environment:
      - TZ=Europe/Lisbon
      # The NAS user the files should belong to (`id` on the NAS shows yours;
      # on Synology, often 1026 and group 100). Leave out to run as root.
      - PUID=1026
      - PGID=100
    volumes:
      - /volume1/docker/scrapytube/data:/data:rw
      - /volume1/media:/media:rw
    ports:
      - 5012:5012
    restart: unless-stopped
```

Open `http://<nas-address>:5012` and create the first account. That person can
add everyone else in *Settings → People*.

If nobody can sign in anymore, give someone a new password:

```bash
sudo docker exec scrapytube node src/server/cli/reset-password.ts <username>
```

### HTTPS with Tailscale (to install it as an app)

Browsers only install a web app, and let it receive shared links, over HTTPS
(or on `localhost`). Over plain `http://nas:5012` ScrapyTube works in the
browser, but can't be installed. Serve it over HTTPS on your tailnet:

```bash
tailscale serve --bg --https=8447 http://127.0.0.1:5012
```

Then open `https://<nas-name>.<tailnet>.ts.net:8447` on the phone, sign in, and
use *Install app* (Android) or *Share → Add to Home Screen* (iPhone).

### Sharing a link from the YouTube app

- **Android**: once installed, ScrapyTube is in the *Share* menu of the YouTube app (and of any app sharing a link). Sharing opens it with the video ready: choose Video or Music.
- **iPhone**: iOS doesn't let web apps receive shares, but a Shortcut can. In *Shortcuts*, make a shortcut that *Receives URLs from the Share Sheet*, and whose action is *Open URLs* with `https://<your ScrapyTube address>/share?url=` followed by *Shortcut Input*. It then shows in the YouTube app's *Share → More*.

### When YouTube asks to confirm you're not a bot

YouTube sometimes refuses the NAS's connection with *Sign in to confirm you're
not a bot*, even when the same video downloads fine from your computer: it
judges the network address, not the video. yt-dlp then needs the cookies of a
signed-in YouTube session. Following
[yt-dlp's advice](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies):

1. Open a **private** (incognito) window and sign in to YouTube, preferably with a spare Google account: YouTube may suspend accounts used to download.
2. In that window, open a new tab, close the YouTube tab, and go to `https://www.youtube.com/robots.txt` (it should be the only tab of the private window).
3. Export the cookies of youtube.com to a `cookies.txt` file (Netscape format) with an extension allowed in private windows, such as *Get cookies.txt LOCALLY* (Chrome) or *cookies.txt* (Firefox).
4. Close the private window, without signing out: YouTube then never changes those cookies.
5. In ScrapyTube, *Settings → Downloader → YouTube cookies → Add*, and pick the file.

The cookies are kept in `/data/cookies.txt`, readable by ScrapyTube only, and
never shown again; each run of yt-dlp gets a copy of its own. If YouTube asks
again weeks later, the cookies have expired: export new ones the same way, and
*Replace the cookies*.

### Data and backups

| In the container | Example on the NAS | What is in it |
| --- | --- | --- |
| `/data` | `/volume1/docker/scrapytube/data` | `scrapytube.db` (and `-wal`, `-shm`): the accounts and the downloads list; `bin/yt-dlp`, ScrapyTube's own copy; `tmp/`, downloads in progress; `cache/`; `cookies.txt`, the YouTube cookies if added |
| `/media` | `/volume1/media` | The videos and music |

Back up `/data` (or download a consistent copy of the database from
*Settings → Data → Download a backup*); the media folder is yours to back up
like any other.

Downloads in progress are kept in `/data/tmp` until they are finished, so the
media folder only ever gets complete files (no `.part` files for Plex or
Jellyfin to pick up). On a NAS, moving the finished file from one volume to the
other is a copy: for very large files, keep both on the same disk.

### Configuration

Environment variables of the container:

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `5012` | Port inside the container |
| `DATA_DIR` | `/data` | ScrapyTube's own folder |
| `MEDIA_DIR` | `/media` | Where downloads are saved |
| `PUID`, `PGID` | (root) | The user and group that run ScrapyTube and own what it saves |
| `UMASK` | `0002` | Permissions of what it saves: `0002` lets the group change files, `0022` only the owner |
| `TZ` | UTC | Time zone |
| `MAX_DOWNLOADS` | `2` | Downloads running at the same time (1 to 10) |
| `YTDLP_AUTO_UPDATE` | `true` | Update yt-dlp at start and every day |
| `YTDLP_CHANNEL` | `stable` | `stable`, or `nightly` for fixes before they are released (useful when YouTube just broke something) |
| `YTDLP_PATH` | | A yt-dlp to use as it is, never updated by ScrapyTube |
| `FFMPEG_PATH` | `ffmpeg` | The ffmpeg to use |
| `SESSION_DAYS` | `180` | How long a device stays signed in without being used |

**yt-dlp options of your own.** ScrapyTube reads a `yt-dlp.conf` placed in the
data folder (`/data/yt-dlp.conf`), for options it doesn't set itself, such as a
proxy (`--proxy socks5://…`). Options ScrapyTube sets (formats, file names,
cookies) take precedence; add YouTube cookies in Settings instead.

---

## How it works

### Where files go

`<folder you picked>/<channel's folder, if switched on>/<video title>.<mp4 or mp3>`

- The channel's folder is the channel's handle without the `@` (`@RickAstleyYT` → `RickAstleyYT`), or its name when it has no handle.
- Titles are kept readable: characters Windows shares refuse are replaced by look-alikes (`AC/DC: Live?` → `AC⧸DC： Live？`), and names stay under 180 bytes.
- If the file is already there, ScrapyTube asks before downloading it again and replacing it.
- Folder names you type are checked the same way (no `/ \ : * ? " < > |`, no leading or trailing dot). Hidden folders and the NAS's own (`@eaDir`, `#recycle`…) are not shown.

### Formats

- **Video**: `-S vcodec:h264,res,acodec:m4a` picks the highest H.264 picture (YouTube offers it up to 1080p) with AAC sound, merged into an MP4 with the title, channel, date and chapters. Only a video with no H.264 at all falls back to another codec, still in an MP4.
- **Music**: the best sound, converted to MP3 (VBR, about 245 kb/s), with the title, artist and date, and the video's picture cropped to a square as the cover.

yt-dlp runs with Node.js (already in the image) as the JavaScript runtime it
needs to read YouTube's pages.

### Downloads

A download is looked up first (title, channel, length) when the link is
pasted; the answer is reused when it starts. Downloads run in the order asked,
`MAX_DOWNLOADS` at a time, each in its own folder in `/data/tmp`. If the
container stops, the ones running start again where they were at the next
start. Stopping one deletes its parts. Removing a download from the list never
deletes its file.

---

## Developing

Node.js 24 and Yarn 4 (the repository carries its own Yarn), and ffmpeg
(`brew install ffmpeg`). yt-dlp is downloaded to `./data/bin` on the first
start.

```bash
yarn install
yarn dev              # the API on :5012 and the web app on http://localhost:5173
```

Data is kept in `./data`, downloads in `./media`.

| Command | What it does |
| --- | --- |
| `yarn dev` | API server (restarted on changes) and Vite together |
| `yarn test` | The tests (server, shared code and web app) |
| `yarn typecheck` | `tsc -b`, strict |
| `yarn build` | Builds the web app and its service worker into `dist/client` |
| `yarn serve` | Builds, then serves everything on :5012 with `./data` and `./media` |
| `yarn icons` | Redraws the icons in `public/` from the logo's geometry (`src/client/components/mark.ts`) |
| `yarn docker:build` | Builds `scrapytube.tar` for the NAS |

How it is put together (the same base as Arctir):

- **Server** (`src/server`): Node.js running TypeScript directly, [Hono](https://hono.dev), SQLite through the built-in `node:sqlite`, `zod`, scrypt-hashed passwords and cookie sessions. `media.ts` is the only way into the media folder (paths are checked never to lead out of it); `ytdlp/` builds yt-dlp's command lines, reads its output and keeps it updated; `queue.ts` runs the downloads.
- **Web app** (`src/client`): React 19, Vite, TanStack Query, React Router, React Aria, i18next. `features/downloads` is the paste box, the new download sheet, the folder picker and the list.
- **Shared** (`src/shared`): the API's types and schemas, reading YouTube links (`youtube.ts`), and file names (`paths.ts`), so the web app shows exactly where a file will go.
- **Translations** (`src/client/i18n/locales`): English is the source; French and Portuguese must have the same keys (checked by the type system and by a test).

## Not in this version

Playlists and whole channels; sites other than YouTube; choosing a video
quality; subtitles; renaming, moving or deleting files and folders from the
app; signing in to YouTube from the app (cookies come from a `cookies.txt` file).

## License

MIT, see [LICENSE](LICENSE).

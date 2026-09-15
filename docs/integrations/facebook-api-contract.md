# Facebook Page API contract: Pi preview boundary

Status: verified-documentation contract; account capability unverified.  
Checked: 2026-09-14.

This is a public Meta documentation contract, not a credential, Page-role,
app-review, or capability receipt. No login, Graph API Explorer query, token
generation, permission grant, or Page request was performed to record it.

## Explicit version and authority boundary

The local non-secret configuration explicitly selects **`v26.0`** as
`GRAPH_API_VERSION`. Every future Graph/Reels request must include that version,
never an implicit/default version. Runtime configuration must use a private Page
token-file reference; tokens, app secrets, and client secrets must never enter
config snapshots, documentation, tests, command output, or git. An app ID or
OAuth secret is not Page publishing authority.

A real Page action needs a non-expired Page access token, required scopes and
Page tasks, plus a successful read-only capability probe for the configured
Page. Preview blocks every mutation at both caller and transport boundaries.

## Page text and photo contract

| Operation              | Explicit-version request                                                                                                                           | Documented success / reconciliation                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text                   | `POST https://graph.facebook.com/v26.0/{page_id}/feed`, `message`, optional `link`; set `published=false` and `scheduled_publish_time` to schedule | `{ "id": "page_post_id" }`; Meta documents schedules 10 minutes–30 days after the request. Read back the known ID; acceptance is not proof of publication. |
| Photo                  | `POST https://graph.facebook.com/v26.0/{page_id}/photos` with a fetchable `url`                                                                    | `{ "id": "photo_id", "post_id": "page_post_id" }`; retain both IDs. A local filesystem path is not the documented URL.                                     |
| Read Page posts        | `GET https://graph.facebook.com/v26.0/{page_id}/feed`                                                                                              | `data[]` has IDs and created times; follow documented paging and correlate a known ID.                                                                     |
| Delete known Page post | `DELETE https://graph.facebook.com/v26.0/{page_post_id}`                                                                                           | `{ "success": true }`; requires separate future authorization.                                                                                             |

The Posts guide lists `pages_manage_engagement`, `pages_manage_posts`,
`pages_read_engagement`, `pages_read_user_engagement`, and `publish_video` for
video. The app user must have `CREATE_CONTENT`, `MANAGE`, and `MODERATE` Page
tasks. A live app also needs approved permissions/features where applicable.

## Page Reels contract

Reels are Page-only and follow a start → transfer → inspect → finish state
machine. Upload success is not publication success.

| Phase           | Explicit-version request                                                                                                                                  | Durable result                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Start           | `POST https://graph.facebook.com/v26.0/{page_id}/video_reels` with `upload_phase=start`                                                                   | `{ "video_id": "…", "upload_url": "…" }`; persist Page ID, content hash, video ID, upload URL and phase.                             |
| Transfer file   | `POST https://rupload.facebook.com/video-upload/v26.0/{video_id}` with OAuth Page token, `offset`, `file_size`, octet-stream bytes                        | `{ "success": true }`; persist acknowledged offset.                                                                                  |
| Inspect/resume  | `GET https://graph.facebook.com/v26.0/{video_id}?fields=status`                                                                                           | Persist upload, processing and publishing phases. Resume at `status.uploading_phase.bytes_transfered`; bounded timeout is `unknown`. |
| Finish          | `POST https://graph.facebook.com/v26.0/{page_id}/video_reels` with `video_id`, `upload_phase=finish`, `video_state=PUBLISHED`, optional description/title | `{ "success": true }`; stay processing/unknown until authoritative status confirms it.                                               |
| List Page Reels | `GET https://graph.facebook.com/v26.0/{page_id}/video_reels`                                                                                              | `data[]` provides published Reel IDs/update times; correlate known `video_id` first.                                                 |

The Reels guide requires a Page access token for an app user with
`CREATE_CONTENT`, plus `pages_show_list`, `pages_read_engagement`, and
`pages_manage_posts`. It documents 30 API-published Reels per rolling 24 hours
on `POST /{page_id}/video_reels`, 3–90 seconds, 540×960 minimum, and 24–60 fps.

No supported Reels future-scheduling or cancellation operation is documented
in these sources. `bounds()` must report local due-time dispatch rather than a
Facebook-confirmed Reel schedule; it must not invent cancellation.

## Intent and uncertain outcomes

Persist immutable intent before any future mutation: request ID, operation,
explicit version, Page ID, artifact/version/content hash, time, and known IDs.
Persist each confirmed response before return. A lost response cannot be resent.
Without an authoritative, correlated lookup, reconciliation **must return
`unknown`**. `absent` needs proof across relevant attempts. Cancellation never
follows an unknown result.

## Sanitized fixtures

```json
{ "id": "page_post_id" }
```

```json
{ "id": "photo_id", "post_id": "page_post_id" }
```

```json
{ "video_id": "video_id", "upload_url": "https://rupload.facebook.com/video-upload/video_id" }
```

## Sources and remaining prerequisites

- Meta, [Pages API: Posts](https://developers.facebook.com/documentation/pages-api/posts), updated April 17, 2026; accessed 2026-09-14.
- Meta, [Reels Publishing API](https://developers.facebook.com/documentation/video-api/guides/reels-publishing), updated July 30, 2026; accessed 2026-09-14.
- Meta, [Graph API Explorer Guide](https://developers.facebook.com/docs/graph-api/guides/explorer/), accessed 2026-09-14. It documents app-role requirements, explicit version selection, and token permissions; it was read only.

Before a real action, separately verify the selected Page identity, token expiry,
scopes/tasks, app-review/features, Page/Reels eligibility, and a read-only
capability probe. Each external request requires explicit operator authorization.

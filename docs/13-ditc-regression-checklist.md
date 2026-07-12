# DITC regression checklist

Browser: Google Chrome  Date: 2026-07-12  Commit: d880499

| Test | Pass | Fail | Notes |
| --- | :---: | :---: | --- |
| Drag one supported audio file into DITC | [x] | [ ] | |
| Drag multiple supported files | [x] | [ ] | |
| Drag a folder with nested supported files | [x] | [ ] | |
| Confirm all supported files appear once | [x] | [ ] | |
| Confirm an unsupported or malformed file fails safely | [x] | [ ] | |
| Preview a track | [x] | [ ] | |
| Start another preview and confirm the first stops | [x] | [ ] | |
| Stop Preview immediately | [x] | [ ] | |
| Load Deck A | [x] | [ ] | |
| Load Deck B | [x] | [ ] | |
| Add and remove a tag | [x] | [ ] | |
| Toggle Favorite and filter Favorites | [x] | [ ] | |
| Search by filename, folder, genre, notes and tags | [x] | [ ] | |
| Change collection filter and sort order | [x] | [ ] | |
| Delete one track after confirmation | [x] | [ ] | |
| Select multiple tracks and apply a batch tag | [x] | [ ] | |
| Reload and verify favorites, tags and URL references persist | [x] | [ ] | |
| Confirm local audio files do not persist after refresh | [x] | [ ] | |
| Start Smart Mix using imported local tracks | [x] | [ ] | |
| Press Space and confirm preview and all other audio stop | [x] | [ ] | |
| Run the Decks regression checklist | [x] | [ ] | |

Do not mark audio tests passed from code inspection alone.

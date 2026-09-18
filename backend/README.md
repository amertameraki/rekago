# Rekago Apps Script Backend

This directory is the version-controlled source for the Google Apps Script backend used by Rekago.

The initial files are an exact copy of the previously unversioned local mirror at:

```text
/Users/amifraise/Mac/Developers/RekaGo/GS & HTML/
```

## Deployment model

Changes in this directory are not deployed automatically by Vercel or GitHub Pages. After a backend increment is reviewed and tested, the changed `.gs` files must be copied into the Google Apps Script project and deployed as a new Web App version.

Backend changes should be developed additively and remain compatible with the currently deployed frontend. New frontend behavior must remain disabled until its backend deployment has passed staging tests.

Do not commit credentials, private keys, access tokens, or spreadsheet data to this directory.

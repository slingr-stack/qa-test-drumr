# Drumr Test Manager

Drumr Test Manager is a local web UI and CLI for collecting, organizing, and
executing unit, integration, and E2E tests for a Drumr application.

It is installed in an application's `qa/` directory. The command discovers the
application outside `qa/` and stores Test Manager files in
`qa/drumr-test-management/`.

## Install in an application

From the application's `qa/` directory, create `.npmrc` with the QA Artifact
Registry configuration:

```ini
@drumr:registry=https://us-central1-npm.pkg.dev/slingr-qa/drumr-npm/
//us-central1-npm.pkg.dev/slingr-qa/drumr-npm/:_authToken=${DRUMR_NPM_TOKEN}
always-auth=true
```

Authenticate with Google Cloud and export a short-lived access token in the
same shell session. The token normally expires after about one hour.

```bash
gcloud auth login
export DRUMR_NPM_TOKEN="$(gcloud auth print-access-token)"
```

Install the current beta release:

```bash
pnpm add -D @drumr/test-management@beta
```

Confirm that the executable is available:

```bash
pnpm exec drumr-test-manager --help
```

## Use Test Manager

Run these commands from the application's `qa/` directory:

```bash
pnpm exec drumr-test-manager setup
pnpm exec drumr-test-manager open
```

`setup` creates the following local infrastructure:

```text
qa/drumr-test-management/
  testsManagement/test-plans.json
  frontend/tests/e2e/
  backend/tests/unit/
  backend/tests/integration/
```

`open` starts the Test Manager UI at `http://localhost:4000`. Use
`--no-open` to prevent opening a browser or `--port <number>` to select a
different port.

By default, Test Manager collects test files from `backend/tests` and
`frontend/tests` under the directory above `qa/`. These directories are
optional; if either one is missing, Test Manager starts normally and simply
collects no tests from that directory. Use these environment variables when
the application uses a different layout:

```bash
export DRUMR_TEST_MANAGER_APP_ROOT=/path/to/application
export DRUMR_TEST_MANAGER_BACKEND_TESTS_DIR=server/specs
export DRUMR_TEST_MANAGER_FRONTEND_TESTS_DIR=client/specs
```

Test directory values are relative to the application root unless they are
absolute paths. `DRUMR_TEST_MANAGER_APP_ROOT` is relative to `qa/` unless it
is absolute.

## Share state through Cloud Storage

Local storage is the default. To share test plans and run state, install the
optional Cloud Storage client in `qa/`:

```bash
pnpm add -D @google-cloud/storage
```

Authenticate Application Default Credentials once per machine, then configure
the storage environment for every `setup` or `open` session:

```bash
gcloud auth application-default login

export DRUMR_TEST_MANAGER_STORAGE=gcs
export DRUMR_TEST_MANAGER_GCS_BUCKET=slingr-qa-drumr-test-manager
export DRUMR_TEST_MANAGER_GCS_PREFIX=my-application

pnpm exec drumr-test-manager setup
pnpm exec drumr-test-manager open
```

`DRUMR_TEST_MANAGER_GCS_PREFIX` is optional. The identity used for Application
Default Credentials needs `roles/storage.objectAdmin` on the bucket.

## Publish a new QA version

Publishing does not require merging first; it publishes the version currently
in your working tree. Commit and merge separately to preserve the source
change in the repository.

```bash
cd qa/drumr-test-management
```

Update `version` in `package.json` to a new, unpublished prerelease version:

```json
"version": "1.0.0-beta.4"
```

Publish the package:

```bash
pnpm run publish:gcp
```

The publish script builds the package, obtains a temporary token from the
active `gcloud` session, and publishes prerelease versions with the `beta`
dist-tag.

Verify the package and its versions in Artifact Registry:

```bash
gcloud artifacts packages list \
  --project=slingr-qa \
  --location=us-central1 \
  --repository=drumr-npm

gcloud artifacts versions list \
  --project=slingr-qa \
  --location=us-central1 \
  --repository=drumr-npm \
  --package=@drumr/test-management
```

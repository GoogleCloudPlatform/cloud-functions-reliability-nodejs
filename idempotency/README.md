# Idempotency

This is sample code which demonstrates how to make your Cloud Functions
idempotent.

## Instructions

Create a Cloud Firestore project by following
[these instructions](https://firebase.google.com/docs/firestore/quickstart#create_a_project)
or use a project in which you have already used Cloud Firestore. Set this
project in Cloud SDK:

```
gcloud config set project [PROJECT_ID]
```

Deploy the `flaky` function, which simulates a flaky service on which your other
functions depend:

```
gcloud functions deploy flaky --trigger-http
```

(Note: in this sample code, `package.json` declares dependencies for all
functions from `index.js`. In production scenarios, we recommend isolating
dependencies of your functions to avoid installing unnecessary modules on
function deployment).

Then, deploy the `nonIdempotentFirestoreFunction`, which is triggered by Cloud
Pub/Sub messages and adds a document to Cloud Firestore before calling the
`flaky` function. Replace `[TOPIC_FOR_FIRESTORE_1]` with the name of the Pub/Sub
topic you want to use and add the `--retry` option to have the function retried
on failure:

```
gcloud functions deploy nonIdempotentFirestoreFunction --trigger-topic [TOPIC_FOR_FIRESTORE_1] --retry
```

To invoke the function, publish some messages on the topic you specified:

```
gcloud pubsub topics publish [TOPIC_FOR_FIRESTORE_1] --message "{ \"value\": \"${RANDOM}\"}"
```

If the function fails and is retried, you will observe duplicate documents in
Cloud Firestore. To prevent this situation, deploy the idempotent version of the
function:

```
gcloud functions deploy idempotentFirestoreFunction --trigger-topic [TOPIC_FOR_FIRESTORE_2] --retry
```

And publish some messages to the new topic:

```
gcloud pubsub topics publish [TOPIC_FOR_FIRESTORE_2] --message "{ \"value\": \"${RANDOM}\"}"
```

You shouldn't observe duplicates anymore.

Now, deploy the `nonIdempotentEmailFunction`, which is also triggered by Cloud
Pub/Sub messages and simulates sending (or actually sends) an email before
calling the `flaky` function. Replace `[TOPIC_FOR_EMAIL_1]` with the name of the
Pub/Sub topic you want to use and add the `--retry` option to have the function
retried on failure. If you want to only simulate sending an email by logging a
message, deploy the code from the repository unchanged. If you want to actually
send an email from the function, follow the comment in function code, and change
the code accordingly before deploying the function.

```
gcloud functions deploy nonIdempotentEmailFunction --trigger-topic [TOPIC_FOR_EMAIL_1] --retry
```

To invoke the function, publish some messages on the topic you specified. The
function expects the `text` field to be present:

```
gcloud pubsub topics publish [TOPIC_FOR_EMAIL_1] --message "{ \"text\": \"${RANDOM}\"}"
```

If the function fails and is retried, you will observe duplicate entries about
sending an email in Stackdriver Logging (or actual duplicate emails sent if you
had configured Sendgrid and adjusted function code). To get rid of the vast
majority of duplicates, deploy `almostIdempotentEmailFunction`:

```
gcloud functions deploy almostIdempotentEmailFunction --trigger-topic [TOPIC_FOR_EMAIL_2] --retry
```

And publish some messages to the new topic:

```
gcloud pubsub topics publish [TOPIC_FOR_EMAIL_2] --message "{ \"text\": \"${RANDOM}\"}"
```

It is very unlikely that you will observe any duplicates but they can still
occur, occasionally. To practically eliminate them, deploy
`idempotentEmailFunction`:

```
gcloud functions deploy idempotentEmailFunction --trigger-topic [TOPIC_FOR_EMAIL_3] --retry
```

And publish some messages to the new topic:

```
gcloud pubsub topics publish [TOPIC_FOR_EMAIL_3] --message "{ \"text\": \"${RANDOM}\"}"
```

You shouldn't observe duplicates now.

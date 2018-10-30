# Retries

This is sample code which demonstrates retrying Cloud Functions on failure.

## Instructions

Deploy the `flaky` function, which simulates a flaky service on which your other
functions depend:

```
gcloud functions deploy flaky --trigger-http
```

Deploy the `httpFunction`, which is triggered by HTTP requests and calls the
`flaky` function internally:

```
gcloud functions deploy httpFunction --trigger-http
```

To have the `httpFunction` function retried on failure, use retries at the call
site. For example, call the function from your machine using the `caller.js`
script:

```
npm install
node caller.js --project [PROJECT] --region [REGION]
```

(Note: in this sample code, `package.json` declares dependencies for both
`index.js` and `caller.js`. In production scenarios, we recommend isolating
dependencies of your functions to avoid installing unnecessary modules on
function deployment).

Deploy the `pubSubFunction`, which is triggered by Cloud Pub/Sub messages and
calls the `flaky` function internally. Use any topic name for `[TOPIC]` To have
the function retried on failure, add the `--retry` option:

```
gcloud functions deploy pubSubFunction --trigger-topic [TOPIC] --retry
```

To invoke the function, publish a message on the topic you specified:

```
gcloud pubsub topics publish [TOPIC] --message {}
```

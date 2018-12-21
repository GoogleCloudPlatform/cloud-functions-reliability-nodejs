# Order processing

This is an example which demonstrates the usefulness of retries and idempotency
when building a solution based on Cloud Functions. Here, it is a sample
restaurant order processing pipeline.

## Instructions

Create a Cloud Firestore project by following
[these instructions](https://firebase.google.com/docs/firestore/quickstart#create_a_project)
or use a project in which you have already used Cloud Firestore. Configure the
Cloud SDK to use this project:

```
gcloud config set project [PROJECT_ID]
```

Deploy the `publish` function, which generates an order by publishing a Cloud
Pub/Sub message:

```
gcloud functions deploy publish --trigger-http
```

(Note: in this sample code, `package.json` declares dependencies for all
functions from `index.js`. In production scenarios, we recommend isolating
dependencies of your functions to avoid installing unnecessary modules on
function deployment).

Then, deploy the `processOrder` function, which is triggered by Cloud Pub/Sub
messages and does three things sequentially: calls the simulated third-party
`chooseCook` service to choose the cook who will handle the order; stores the
order in Cloud Firestore; and calls another simulated third-party service,
`prepareMeal`, which notifies the cook about the order.

```
gcloud functions deploy processOrder --trigger-topic outgoing
```

(Note: if `chooseCook` and `prepareMeal` services took awhile to respond and
supported callback URLs, you could introduce a tail-call optimization by
chaining the calls and eliminating the `processOrder` function).

Finally, deploy the `chooseCook` and `prepareMeal` functions, which simulate
flaky third-party services on which the `processOrder` function depends:

```
gcloud functions deploy chooseCook --trigger-http
gcloud functions deploy prepareMeal --trigger-http
```

To test the pipeline you just created, generate some load by invoking the
`publish` function multiple times. Replace `[REGION]` and `[PROJECT]` with the
name and ID of the region and project to which you deployed the functions:

```
for i in {1..30}
do
  curl https://[REGION]-[PROJECT].cloudfunctions.net/publish \
      --header "Content-Type: application/json" \
      --data "{ \"topic\": \"outgoing\", \"data\": \"Order $i\" }"
done
```

Wait a minute, and go to the Database viewer for Cloud Firestore in the
[Firebase Console](https://console.firebase.google.com/). You will likely
observe less orders in the `incoming` collection than you generated. This means
that some of the orders got lost in the process. To prevent this situation,
deploy `processOrderRetry` function with the 'retry on failure' option enabled.
The code for `processOrderRetry` remains unchanged compared to `processOrder`,
it just stores the orders in a different Cloud Firestore collection.

```
gcloud functions deploy processOrderRetry --trigger-topic outgoingRetry --retry
```

To test the new version of the pipeline, generate load by invoking the `publish`
function multiple times again, this time pointing to the new topic:

```
for i in {1..30}
do
  curl https://[REGION]-[PROJECT].cloudfunctions.net/publish \
      --header "Content-Type: application/json" \
      --data "{ \"topic\": \"outgoingRetry\", \"data\": \"Order $i\" }"
done
```

Wait a minute, then open the Cloud Firestore data viewer and take a look at the
`incomingRetry` collection. You will likely observe more orders than you
generated. This means that some of the orders got duplicated in the process. To
prevent this situation, deploy `processOrderRetryIdempotent` function, which
uses a Cloud Firestore transaction to avoid duplicates among orders stored in
another Cloud Firestore collection. Keep the 'retry on failure' option enabled:

```
gcloud functions deploy processOrderRetryIdempotent --trigger-topic outgoingRetryIdempotent --retry
```

To test this version of the pipeline, generate load by invoking the `publish`
function multiple times again, pointing to the topic you just used:

```
for i in {1..30}
do
  curl https://[REGION]-[PROJECT].cloudfunctions.net/publish \
      --header "Content-Type: application/json" \
      --data "{ \"topic\": \"outgoingRetryIdempotent\", \"data\": \"Order $i\" }"
done
```

Wait a minute, and open the Cloud Firestore data viewer again. Take a look at
the `incomingRetryIdempotent` collection. You shouldn't observe any lost or
duplicate orders.

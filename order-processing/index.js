/**
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const PubSub = require('@google-cloud/pubsub');
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const request = require('request-promise');
const randomItem = require('random-item');

admin.initializeApp(functions.config().firebase);

const pubsubClient = new PubSub();
const db = admin.firestore();

const project = process.env.GCP_PROJECT;
const region = process.env.FUNCTION_REGION;

/**
 * Publishes the given data to the given Cloud Pub/Sub topic.
 *
 * @param {Object} req The HTTP request.
 * @param {Object} res The HTTP response.
 */
exports.publish = (req, res) => {
  console.log(
      `Publishing data '${req.body.data}' to topic '${req.body.topic}'.`);
  const topic = req.body.topic;
  const data = Buffer.from(req.body.data);
  pubsubClient.topic(topic)
      .publisher()
      .publish(data)
      .then(messageId => {
        console.log(`Message ${messageId} published to topic ${topic}.`);
        res.status(200).send(`'${data}' published to '${topic}'.\n`);
      })
      .catch(err => {
        console.error(`Publish error: ${err}`);
        res.status(500).send('Failed.\n');
      });
};

const successRatio = 0.9;
const cooks = [
  'John',
  'Patricia',
  'Mike',
  'Linda',
  'Steve',
  'Katie',
];

/**
 * Simulates a service which selects a random cook, or fails occasionally.
 *
 * @param {Object} req The HTTP request.
 * @param {Object} res The HTTP response.
 */
exports.chooseCook = (req, res) => {
  if (Math.random() < successRatio) {
    res.status(200).send({cook: randomItem(cooks)});
  } else {
    res.status(500).send('Transient failure from chooseCook.');
  }
};

/**
 * Simulates a service which notifies a cook about an order, or fails
 * occasionally.
 *
 * @param {Object} req The HTTP request.
 * @param {Object} res The HTTP response.
 */
exports.prepareMeal = (req, res) => {
  if (Math.random() < successRatio) {
    res.status(200).send('Cook successfully notified to prepare a meal.');
  } else {
    res.status(500).send('Transient failure from prepareMeal.');
  }
};

/**
 * Non-idempotent Pub/Sub-triggered function which handles an order, using
 * 'incoming' collection in Cloud Firestore.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.processOrder = (event) => {
  return nonIdempotentProcessOrder('incoming', event);
};

/**
 * Non-idempotent Pub/Sub-triggered function which handles an order, using
 * 'incomingRetry' collection in Cloud Firestore.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.processOrderRetry = (event) => {
  return nonIdempotentProcessOrder('incomingRetry', event);
};

/**
 * Non-idempotent function which does three things sequentially: calls
 * chooseCook service to choose the cook who will handle the order, then stores
 * the order in the given collection in Cloud Firestore, and then calls
 * prepareMeal service to start meal preparation.
 *
 * @param {String} collection The name of the Cloud Firestore collection.
 * @param {Object} event The Cloud Pub/Sub event.
 */
function nonIdempotentProcessOrder(collection, event) {
  const context = event.context;
  const message = event.data;
  const order = {
    id: context.eventId,
    timestamp: context.timestamp,
    meal: message.data ? Buffer.from(message.data, 'base64').toString() : '',
  };
  console.log(`Received an order for meal ${order.meal}`);
  return request({
           method: 'GET',
           uri: `https://${region}-${project}.cloudfunctions.net/chooseCook/`,
           json: true
         })
      // The code below is not executed if the call to chooseCook failed.
      .then(res => {
        order.cook = res.cook;
        console.log(`Assigning cook ${order.cook} and storing order`);
        return db.collection(collection).add(order);
      })
      .then(() => {
        return request({
          method: 'POST',
          uri: `https://${region}-${project}.cloudfunctions.net/prepareMeal/`,
          body: order,
          json: true
        });
      });
}

/**
 * Idempotent Pub/Sub-triggered function which does three things sequentially:
 * calls chooseCook service to choose the cook who will handle the order, then
 * stores the order in the 'incomingRetryIdempotent' collection in Cloud
 * Firestore, and then calls prepareMeal service to start meal preparation.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.processOrderRetryIdempotent = (event) => {
  const context = event.context;
  const message = event.data;
  const order = {
    id: context.eventId,
    timestamp: context.timestamp,
    meal: message.data ? Buffer.from(message.data, 'base64').toString() : '',
  };
  console.log(`Received an order for meal ${order.meal}`);
  return request({
           method: 'GET',
           uri: `https://${region}-${project}.cloudfunctions.net/chooseCook/`,
           json: true
         })
      .then(res => {
        return db.runTransaction(transaction => {
          const doc =
              db.collection('incomingRetryIdempotent').doc(context.eventId);
          return transaction.get(doc).then(snapshot => {
            if (!snapshot.exists) {
              order.cook = res.cook;
              console.log(`Assigning cook ${order.cook} and storing order`);
              transaction.set(doc, order);
            }
          });
        });
      })
      .then(() => {
        return request({
          method: 'POST',
          uri: `https://${region}-${project}.cloudfunctions.net/prepareMeal/`,
          body: {id: order.id},
          json: true
        });
      });
};

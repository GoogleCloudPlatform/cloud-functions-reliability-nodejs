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

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const request = require('request-promise');
const sgMail = require('@sendgrid/mail');

admin.initializeApp(functions.config().firebase);

const db = admin.firestore();

const project = process.env.GCP_PROJECT;
const region = process.env.FUNCTION_REGION;

/**
 * Non-idempotent Pub/Sub-triggered function which adds a document to Cloud
 * Firestore before calling a flaky service.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.nonIdempotentFirestoreFunction = (event) => {
  const message = event.data;
  const content =
      JSON.parse(Buffer.from(message.data || '', 'base64').toString() || '{}');
  return db.collection('contents').add(content).then(() => {
    return request({
      method: 'POST',
      uri: `https://${region}-${project}.cloudfunctions.net/flaky`,
      body: content,
      json: true
    });
  });
};

/**
 * Idempotent Pub/Sub-triggered function which creates or overwrites a document
 * in Cloud Firestore before calling a flaky service.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.idempotentFirestoreFunction = (event) => {
  const message = event.data;
  const content =
      JSON.parse(Buffer.from(message.data || '', 'base64').toString() || '{}');
  const eventId = event.context.eventId;
  return db.collection('contents').doc(eventId).set(content).then(() => {
    return request({
      method: 'POST',
      uri: `https://${region}-${project}.cloudfunctions.net/flaky/${eventId}`,
      body: content,
      json: true
    });
  });
};

/**
 * Non-idempotent Pub/Sub-triggered function which simulates sending (or
 * actually sends) an email before calling a flaky service.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.nonIdempotentEmailFunction = (event) => {
  const message = event.data;
  const content =
      JSON.parse(Buffer.from(message.data || '', 'base64').toString() || '{}');

  console.log(`Sending email with text ${content.text}`);
  // To actually send an email, change the sender and recipient addresses, get
  // SendGrid API Key from https://app.sendgrid.com/settings/api_keys, use it as
  // setApiKey argument, and uncomment the code below.
  // const email = {
  //   to: 'to@example.com',
  //   from: 'from@example.com',
  //   subject: 'Email from Cloud Functions',
  //   text: content.text,
  // };
  // sgMail.setApiKey('SENDGRID_API_KEY');
  // sgMail.send(email);

  // Call another service.
  return request({
    method: 'POST',
    uri: `https://${region}-${project}.cloudfunctions.net/flaky`,
    body: content,
    json: true
  });
};

/**
 * Pub/Sub-triggered function which simulates sending (or actually sends) an
 * email before calling a flaky service. In this version, duplicate emails are
 * very unlikely.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.almostIdempotentEmailFunction = (event) => {
  const message = event.data;
  const content =
      JSON.parse(Buffer.from(message.data || '', 'base64').toString() || '{}');
  const eventId = event.context.eventId;
  const emailRef = db.collection('sentEmails').doc(eventId);

  return shouldSend(emailRef)
      .then(send => {
        if (send) {
          console.log(`Sending email with text ${content.text}`);
          // To actually send an email, change the sender and recipient
          // addresses, get SendGrid API Key from
          // https://app.sendgrid.com/settings/api_keys, use it as setApiKey
          // argument, and uncomment the code below.
          // const email = {
          //   to: 'to@example.com',
          //   from: 'from@example.com',
          //   subject: 'Email from Cloud Functions',
          //   text: content.text,
          // };
          // sgMail.setApiKey('SENDGRID_API_KEY');
          // sgMail.send(email);
          return markSent(emailRef);
        }
      })
      .then(() => {
        // Call another service.
        return request({
          method: 'POST',
          uri: `https://${region}-${project}.cloudfunctions.net` +
              `/flaky/${eventId}`,
          body: content,
          json: true
        });
      });
};

/**
 * Returns true if the given email has not yet been recorded as sent in Cloud
 * Firestore; otherwise, returns false.
 *
 * @param {!firebase.firestore.DocumentReference} emailRef Cloud Firestore
 *     reference to the email.
 * @returns {boolean} Whether the email should be sent by the current function
 *     execution.
 */
function shouldSend(emailRef) {
  return emailRef.get().then(emailDoc => {
    return !emailDoc.exists || !emailDoc.data().sent;
  });
}

/**
 * Records the given email as sent in Cloud Firestore.
 *
 * @param {!firebase.firestore.DocumentReference} emailRef Cloud Firestore
 *     reference to the email.
 * @returns {!Promise} Promise which indicates that the data has successfully
 *     been recorded in Cloud Firestore.
 */
function markSent(emailRef) {
  return emailRef.set({sent: true});
}

/**
 * Pub/Sub-triggered function which simulates sending (or actually sends) an
 * email before calling a flaky service. In this version, duplicate emails are
 * practically eliminated.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.idempotentEmailFunction = (event) => {
  const message = event.data;
  const content =
      JSON.parse(Buffer.from(message.data || '', 'base64').toString() || '{}');
  const eventId = event.context.eventId;
  const emailRef = db.collection('sentEmails').doc(eventId);

  return shouldSendWithLease(emailRef)
      .then(send => {
        if (send) {
          console.log(`Sending email with text ${content.text}`);
          // To actually send an email, change the sender and recipient
          // addresses, get SendGrid API Key from
          // https://app.sendgrid.com/settings/api_keys, use it as setApiKey
          // argument, and uncomment the code below.
          // const email = {
          //   to: 'to@example.com',
          //   from: 'from@example.com',
          //   subject: 'Email from Cloud Functions',
          //   text: content.text,
          // };
          // sgMail.setApiKey('SENDGRID_API_KEY');
          // sgMail.send(email);
          return markSent(emailRef);
        }
      })
      .then(() => {
        // Call another service.
        return request({
          method: 'POST',
          uri: `https://${region}-${project}.cloudfunctions.net` +
              `/flaky/${eventId}`,
          body: content,
          json: true
        });
      });
};

const leaseTime = 60 * 1000;  // 60s, equals function timeout.

/**
 * Returns true if the given email has not yet been recorded as sent in Cloud
 * Firestore and the current execution took the lease; returns a rejected
 * Promise if the email has not been recorded as sent but the lease is already
 * taken by a concurrent function execution; otherwise, returns false.
 *
 * @param {!firebase.firestore.DocumentReference} emailRef Cloud Firestore
 *     reference to the email.
 * @returns {boolean|!Promise} Whether the email should be sent by the current
 *     function execution, or rejected Promise if the lease is already taken.
 */
function shouldSendWithLease(emailRef) {
  return db.runTransaction(transaction => {
    return transaction.get(emailRef).then(emailDoc => {
      if (emailDoc.exists && emailDoc.data().sent) {
        return false;
      }
      if (emailDoc.exists && new Date() < emailDoc.data().lease) {
        return Promise.reject('Lease already taken, try later.');
      }
      transaction.set(
          emailRef, {lease: new Date(new Date().getTime() + leaseTime)});
      return true;
    });
  });
}

const flakySuccessRatio = 0.5;

/**
 * Simulates a flaky service.
 *
 * @param {Object} req The HTTP request.
 * @param {Object} res The HTTP response.
 */
exports.flaky = (req, res) => {
  if (req.path && req.path.length > 1) {
    console.log(`Received idempotency key ${req.path.substring(1)}`);
  }
  if (Math.random() < flakySuccessRatio) {
    res.status(200).send('Flaky service succeeded!');
  } else {
    res.status(500).send('Flaky service failed.');
  }
};

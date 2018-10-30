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

const request = require('request-promise');

const project = process.env.GCP_PROJECT;
const region = process.env.FUNCTION_REGION;

/**
 * HTTP-triggered function which calls a flaky service.
 *
 * @param {Object} req The HTTP request.
 * @param {Object} res The HTTP response.
 */
exports.httpFunction = (req, res) => {
  request({
    method: 'POST',
    uri: `https://${region}-${project}.cloudfunctions.net/flaky`,
    body: req.body,
    json: true
  })
      .then(apiRes => {
        res.status(200).send('HTTP function succeeded!');
      })
      .catch(err => {
        res.status(500).send('HTTP function failed.');
      });
};


/**
 * Pub/Sub-triggered function which calls a flaky service.
 *
 * @param {Object} event The Cloud Pub/Sub event.
 */
exports.pubSubFunction = (event) => {
  const message = event.data;
  const content =
      JSON.parse(Buffer.from(message.data || '', 'base64').toString() || '{}');
  return request({
    method: 'POST',
    uri: `https://${region}-${project}.cloudfunctions.net/flaky`,
    body: content,
    json: true
  });
};

const flakySuccessRatio = 0.5;

/**
 * Simulates a flaky service.
 *
 * @param {Object} req The HTTP request.
 * @param {Object} res The HTTP response.
 */
exports.flaky = (req, res) => {
  if (Math.random() < flakySuccessRatio) {
    res.status(200).send('Flaky service succeeded!');
  } else {
    res.status(500).send('Flaky service failed.');
  }
};


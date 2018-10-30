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
const promiseRetry = require('promise-retry');

const argv = require('yargs').demandOption(['project', 'region']).argv;
const project = argv.project;
const region = argv.region;

// Call an HTTP endpoint with retries using exponential backoff with
// randomization (see https://en.wikipedia.org/wiki/Exponential_backoff).
console.log(`Calling httpFunction in project ${project} region ${region}`);
promiseRetry(
    {retries: 10, factor: 2, randomize: true},
    (retry, number) => {
      console.log(`Attempt number ${number}.`);
      return request({
               method: 'POST',
               uri: `https://${region}-${project}.cloudfunctions.net` +
                   '/httpFunction',
               body: {foo: 'bar'},
               json: true
             })
          .catch(retry);
    })
    .then(res => {
      console.log(`Success! ${res}`);
    })
    .catch(err => {
      console.log(`Failure. ${err}`);
    });


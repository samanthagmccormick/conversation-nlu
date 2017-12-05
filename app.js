/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

require('dotenv').config({
  silent: true
});

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var watson = require('watson-developer-cloud'); // watson sdk
var http = require('http');

// The following requires are needed for logging purposes
var uuid = require('uuid');
var vcapServices = require('vcap_services');
var basicAuth = require('basic-auth-connect');

var app = express();

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper
var conversation = watson.conversation({
  url: 'https://gateway.watsonplatform.net/conversation/api',
  username: process.env.CONVERSATION_USERNAME || '<username>',
  password: process.env.CONVERSATION_PASSWORD || '<password>',
  version_date: '2017-02-03',
  version: 'v1'
});

// Create service wrapper for Natural Language Understanding
const NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js');
const nlu = new NaturalLanguageUnderstandingV1({
  'username': process.env.NATURAL_LANGUAGE_UNDERSTANDING_USERNAME || '<username>',
  'password': process.env.NATURAL_LANGUAGE_UNDERSTANDING_PASSWORD || '<password>',
  version_date: NaturalLanguageUnderstandingV1.VERSION_DATE_2017_02_27
});

// Define what features you want to extract with NLU
var features = {
  entities: {},
  keywords: {},
  categories: {}
};

// Endpoint to be call from the client side
app.post('/api/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' +
          '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' +
          'Once a workspace has been defined the intents may be imported from ' +
          '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }
  var payload = {
    workspace_id: workspace,
    context: {},
    input: {}
  };
  var params = null;
  if (req.body) {
    if (req.body.input) {
      payload.input = req.body.input;
      params = {
        text: req.body.input.text,
        features: features
      };
    }
    if (req.body.context) {
      // The client must maintain context/state
      payload.context = req.body.context;
    }
  }

  if (params == null) {
    params = {
      text: "sample input",
      features: features
    }
  }

  // Send the conversation input to Natural Language Understanding API
  // If the API responds with valuable data about the input (entities {}, categories {}, keywords {} etc)
  // Then send that data as new context values back to the Conversations API
  // Documentation: https://github.com/watson-developer-cloud/node-sdk/blob/master/natural-language-understanding/v1.js
  nlu.analyze(params, function(error, response) {

    if (response != null) {

      if (response.entities != null) {
        payload.context.naturallanguage_entities = response.entities;
      }

      if (response.categories != null) {
        payload.context.naturallanguage_categories = response.categories;
      }

      if (response.keywords != null) {
        payload.context.naturallanguage_keywords = response.keywords;
      }
    }

    // Send the input to the conversation service
    conversation.message(payload, function(err, data) {
      if (err) {
        return res.status(err.code || 500).json(err);
      }
      updateResponse(res, data);
    });

  });
});

function updateResponse(res, data) {

  // NOTE! I'm just updating the response data.output.text for ease of printing to the client

  // Print each category and relevance
  if (typeof data.context.naturallanguage_entities !== 'undefined' && data.context.naturallanguage_entities.length) {
    data.output.text += '<br /><strong>NLU API Entities:</strong><br />';

    for (var i = 0; i < data.context.naturallanguage_entities.length; i++) {
      data.output.text += data.context.naturallanguage_entities[i].label + ' (score: ' + data.context.naturallanguage_entities[i].score + '),<br />';
    }
  }

  // Print each category and relevance
  if (typeof data.context.naturallanguage_keywords !== 'undefined' && data.context.naturallanguage_keywords.length) {
    data.output.text += '<br /><strong>NLU API Keywords:</strong><br />';

    for (var i = 0; i < data.context.naturallanguage_keywords.length; i++) {
      data.output.text += data.context.naturallanguage_keywords[i].text + ' (relevance: ' + data.context.naturallanguage_keywords[i].relevance + '),<br />';
    }
  }

  // Print each category and relevance
  if (typeof data.context.naturallanguage_categories !== 'undefined' && data.context.naturallanguage_categories.length) {
    data.output.text += '<br /><strong>NLU API Categories:</strong><br />';

    for (var i = 0; i < data.context.naturallanguage_categories.length; i++) {
      data.output.text += data.context.naturallanguage_categories[i].label + ' (score: ' + data.context.naturallanguage_categories[i].score + '),<br />';
    }
  }

  return res.json(data);
};


module.exports = app;
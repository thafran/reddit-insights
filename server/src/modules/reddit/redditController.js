/* eslint-disable require-jsdoc */

import log from '../../helpers/log.js';
import {body, query} from 'express-validator';
import count from 'count-array-values';
import {differenceInDays} from 'date-fns';

import {
  respondWithSuccessAndData,
  respondWithErrorNotFound,
  respondWithError,
  respondWithSuccess,
} from '../../helpers/response.js';
import {
  getSubmissionsFromRedditUserOnPushshift,
  getCommentsFromRedditUserOnPushshift,
} from '../../sources/reddit/pushshift.js';
import {perspectiveAnalysis} from '../../analytics/perspective.js';
import {getRandomInt} from '../../helpers/utils.js';
import validate from '../../helpers/validate.js';
import redditModel from './redditModel.js';

const VALIDITY_PERIOD = 90;
const VALIDTITY_DEBUG = true;

/**
 * Controller class managing incoming requests to the respective model
 * each controller function is actually an array of functions to be plugged into
 * the router with validations by express-validator before as well as
 * the validate helper to check for detected validation errors
 * @param {Request} req
 * @param {Response} res
 * @param {Next} next
 */
export default class RedditController {
  /**
   * Takes multiple identifiers in a post body and sends array of results
   * (array can be empty if no results are found)
   * Creates an reddit object
   * @param {Request} req request instance
   * @param {Response} res response instance
   */
  static get = [
    // Validations using express-validator
    body('identifiers')
        .exists().withMessage('identifiers in request body required')
        .isArray().withMessage('identifiers must be an array'),
    body('identifiers.*')
        .isString().withMessage('identifier must be of type string'),
    // Using own helper to check for generated validation errors
    validate,
    // Actual controller method handling valid request
    async (req, res) => {
      const identifiers = req.body.identifiers;
      const data = await redditModel.find({identifier: identifiers});
      if (data !== null) {
        respondWithSuccessAndData(
            res,
            data,
        );
      } else {
        respondWithNotErrorNotFound(res);
      }
    },
  ];

  /**
   * Gets one reddit instance
   * @param {Request} req request instance
   * @param {Response} res response instance
   */
  static getOne = [
    // Validations using express-validator
    query('identifier')
        .exists().withMessage('Value is required')
        .isString().withMessage('Value needs to be string'),
    // Using own helper to check for generated validation errors
    validate,
    // Actual controller method handling valid request
    async (req, res) => {
      const identifier = req.query.identifier;
      const data = await redditModel
          .findOne({identifier: identifier}).exec();
      if (data !== null) {
        respondWithSuccessAndData(
            res,
            data,
        );
      } else {
        respondWithSuccessAndData(
            res,
            data,
            'No information for given identifier',
        );
      }
    },
  ];

  /**
   * Creates an reddit object
   * @param {Request} req request instance
   * @param {Response} res response instance
   */
  static createOne = [
    body('identifier')
        .exists().withMessage('Value is required')
        .isString().withMessage('Value needs to be string'),
    validate,
    async (req, res) => {
      const identifier = req.body.identifier;
      try {
        const data = await redditModel.create(
            {
              identifier,
              liwcAnalytical: getRandomInt(99),
              liwcEmotionalTone: getRandomInt(99),
            },
        );
        respondWithSuccessAndData(
            res,
            data,
            'Created new element',
        );
      } catch (err) {
        if (err?.code === 11000) {
          respondWithError(res, 'Identifier already exists');
        } else {
          log.error('DATABASE ERROR', err);
          respondWithError(res);
        }
      }
    },
  ];

  static analyze = [
    query('identifier')
        .exists().withMessage('Value is required')
        .isString().withMessage('Value needs to be string'),
    validate,
    async (req, res) => {
      const identifier = req.query.identifier;
      try {
        let data = await redditModel.findOne({identifier: identifier});
        if (data !== null) {
          const lastTimeUpdated = new Date(data.createdAt);
          const daysSinceLastUpdate = differenceInDays(
              Date.now(),
              lastTimeUpdated);

          if (daysSinceLastUpdate > VALIDITY_PERIOD || VALIDTITY_DEBUG) {
            data = await analyze(data, identifier);
            await data.save();
            log.info('ANALYZE', 'Updated');
            respondWithSuccessAndData(
                res,
                await data,
                'Updated analysis for an existing Reddit user',
            );
            return;
          } else {
            log.info('ANALYZE', 'Kept');
            respondWithSuccessAndData(
                res,
                data,
                'Kept analysis for an existing Reddit user',
            );
            return;
          }
        } else {
          data = await redditModel.create({
            identifier,
          });
        }
        data = await analyze(data, identifier);
        // await redditModel.updateOne({identifier}, await data);

        log.info('ANALYZE', 'Created');
        respondWithSuccessAndData(
            res,
            await data,
            'Created analysis for a new Reddit user',
        );
      } catch (e) {
        log.error(e);
      }
    },
  ];
}

async function analyze(redditModel, identifier) {
  log.info('ANALYZE', `Analyzing information for ${identifier}`);

  const submissions = await getSubmissionsFromRedditUserOnPushshift(
      identifier,
  );

  const comments = await getCommentsFromRedditUserOnPushshift(
      identifier,
  );

  redditModel.metrics.totalSubmissions = submissions.data.length;
  redditModel.metrics.totalComments = comments.data.length;

  const commentScores = [];
  const commentSubreddits = [];

  const submissionScores = [];
  const submissionSubreddits = [];

  for (const comment of comments.data) {
    commentScores.push(comment.score);
    commentSubreddits.push(comment.subreddit);
  }

  for (const submission of submissions.data) {
    submissionScores.push(submission.score);
    submissionSubreddits.push(submission.subreddit);
  }

  redditModel.metrics.medianScoreComments = getMedianOfNumberArray(
      commentScores,
  );
  redditModel.metrics.medianScoreSubmissions = getMedianOfNumberArray(
      submissionScores,
  );

  redditModel.metrics.averageScoreComments = getAverageOfNumberArray(
      commentScores,
  );
  redditModel.metrics.averageScoreSubmissions = getAverageOfNumberArray(
      submissionScores,
  );

  redditModel.context.subredditsForComments = count(
      commentSubreddits,
      'subreddit',
  );
  redditModel.context.subredditsForSubmissions = count(
      submissionSubreddits,
      'subreddit',
  );

  return redditModel;
}

function getAverageOfNumberArray(numberArray) {
  if (numberArray.length === 0) {
    return null;
  }
  let sum = 0;
  for (const element of numberArray) {
    sum += element;
  }
  return sum / numberArray.length;
}

function getMedianOfNumberArray(numberArray) {
  numberArray = numberArray.sort();
  let result = null;
  const mid = Math.floor(numberArray.length / 2);
  result = numberArray[mid];
  if (numberArray.length % 2 === 0) {
    result = (numberArray[mid - 1] + numberArray[mid]) / 2;
  }
  if (isNaN(result)) {
    return 0;
  }
  return result;
}

async function getCommentTextFromUser(username) {
  const comments = [];
  const pushshift = await getCommentsFromRedditUserOnPushshift(username);
  for (const comment of await pushshift.data) {
    if (comment.body) {
      comments.push(comment.body);
    }
  }
  log.debug('getCommentsFromUser', typeof comments);
  return comments;
}

async function getSubmissionTextFromUser(username) {
  const submissions = [];
  const pushshift = await getSubmissionsFromRedditUserOnPushshift(username);
  for (const comment of await pushshift.data) {
    if (comment.selftext) {
      submissions.push(comment.selftext);
    }
  }
  log.debug('getSubmissionsFromUser', typeof submissions);
  return submissions;
}

async function sendTextToPerspective(username) {
  let text = await getCommentTextFromUser(username);
  log.debug('TEXT DIRECT', text);
  text = text.join('; ');
  log.debug('TEXT', text);
  const analysis = await perspectiveAnalysis(text);
  console.log(analysis.attributeScores);
}

async function getTextFromUser(username) {
  const text = [];
  const comments = await getCommentTextFromUser(username);
  const submissions = await getSubmissionTextFromUser(username);
  log.debug(typeof comments);
  log.debug(typeof submissions);
  text.concat(comments);
  text.concat(submissions);
  log.debug(typeof text);
  return text;
}

// console.log(sendTextToPerspective('1r0ll'));

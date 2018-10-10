const fs = require('fs');
const math = require('mathjs');
const Gdax = require('gdax');
const async = require('async');
const _ = require('lodash');

// Get config from environment
const env = process.env.DEV ? 'sandbox' : 'live';
const config = require('./config.json')[env]['gdax'];

// State
const STATE = require('./state');

// Sandbox acc
const key = config.key;
const secret = config.secret;
const passphrase = config.passphrase;
const apiURI = config.apiURI;
const websocketEndpoint = config.websocketEndpoint;
const authedClient = new Gdax.AuthenticatedClient(key, secret, passphrase, apiURI);

// Get Account balances
async function getAccounts() {
  let acc = [];
  try {
    acc = await authedClient.getAccounts();

    // Transform it into an object
    acc = acc.reduce((ret, account) => {
      ret[account.currency] = _.pick(account, ['balance', 'available', 'hold']);
      return ret;
    }, {});
  } catch (error) {
    //console.log('cant get account balance', error);
    throw error;
  }

  return {
    date: + new Date(),
    acc,
  }
}

// Get price from api first
function getPrices(prices) {
  return new Promise((resolve, reject) => {
    let allPrices = {};
    async.each(prices, (productId, cb) => {
      authedClient.getProductTicker(productId, (error, response, data) => {
        allPrices[productId] = {};
        if (!error) {
          // Add the sequence - init
          data['sequence'] = 0;
          allPrices[productId] = data;
        }

        // All done
        cb();
      })
    }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(allPrices);
      }
    });
  })
}

async function placeOrder(payload) {
  try {
    //console.log('going to place order', payload);
    // Place the order
    let order = await authedClient.placeOrder(payload);

    // Check if the order is places
    if (order.message) {
      //console.log('Cant place order', order);
      return order;
    } else {
      //console.log('Order placed', order);
      return order;
    }

  } catch (error) {
    //console.log('There error placing an order', error);
    return error;
  }
}

async function getOrders() {
  authedClient.getOrders((error, response, data) => {
    if (error) {
      console.log('There is error at getting order', error);
    } else {
      console.log('The total orders', data);
    }
  });
}

async function getFills() {
  authedClient.getFills((error, response, data) => {
    if (error) {
      console.log('There is error at getting fills', error);
    } else {
      console.log('The total fills', data);
    }
  });
}

module.exports = function (routes) {
  // Unique identifiers with channels
  const orderIdsNames = ['order_id', 'maker_order_id', 'taker_order_id'];
  // Get the price from websocket
  const websocket = new Gdax.WebsocketClient(routes, websocketEndpoint);

  return {
    client: authedClient,
    websocket,
    getAccounts,
    getPrices,
    getOrders,
    getFills,
    placeOrder,
  }
}

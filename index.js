const fs = require('fs');
const math = require('mathjs');
const uuid = require('uuid/v4');
const _ = require('lodash');

// State
const STATE = require('./state');
const utils = require('./utils');

// Display
const screen = require('./screen')(handleShutdown);

// Constants
const UPDATE_INTERVAL = 2000;
const ORDER_EXECUTE_INTERVAL = 500;

// Global states
// Routes
//const ROUTES = ['BTC-USD', 'ETH-USD', 'ETH-BTC'];
//const ROUTES_SIDE = ['sell', 'buy', 'sell'];

//const ROUTES = ['ETH-EUR', 'ETH-BTC', 'BTC-EUR'];
//const ROUTES_SIDE = ['buy', 'sell', 'sell'];

const ROUTES = ['ETH-EUR', 'BTC-EUR', 'ETH-BTC'];
const ROUTES_SIDE = ['sell', 'buy', 'buy'];
// Transaction fee as percentage
const TRANSACTION_FEE = 0.25;
// Profit threshold is 0.5%
const PROFIT_THRESHOLD = 0.3;

// Triangular the route, see if its profitable to trade or not
function triangular(routes) {
  try {
    // Figure out which account to take the fund
    let initialAmount = 1;
    let initialCurrency = '';
    if (STATE.ACC && STATE.ACC.current) {
      // Figure out which account to use - depend on the first route is buy or sell
      let pairParts = routes[0].split('-');
      if (ROUTES_SIDE[0] === 'buy') {
				// todo: very common to have error because the current acc doesn't have the pair available
        initialAmount = math.eval(STATE.ACC.current.acc[pairParts[1]].available) || initialAmount;
        initialCurrency = pairParts[1];
      } else {
        initialAmount = math.eval(STATE.ACC.current.acc[pairParts[0]].available) || initialAmount;
        initialCurrency = pairParts[0];
      }
    }

    // Only take 90% of the initial amount
    initialAmount = utils.formatCurrency(initialCurrency, math.eval(initialAmount * 0.9));

    // Calculate if the route is worth it by going through the chain
    let chain = math.chain(initialAmount);

    let outputStr = 'routes:';
    // Collect legs paramis within a trade
    let tradeLegs = [];
    // todo: calculate the transaction fee in here as well
    routes.forEach((route, index) => {
      // Use the price for now
      let size = 0;
      let side = ROUTES_SIDE[index];
      const price = STATE.PRICES[routes[index]].price;

      if (index === 0 && side === 'sell') {
          size = chain;
      }

      // Check if need to divide or multiply the prices
      // todo: maybe use the ask and bid price for quick execution
      if (side === 'buy') {
        // Size is before the calculation
        //size = chain;
        chain = chain.divide(price);
      } else {
        // Size is before the calculation
        //size = chain;
        chain = chain.multiply(price);
      }

      if (size === 0) {
        size = chain;
      }

      // Size is the current value until now
      size = utils.formatCurrencyFromSide(side, route, size.done());

      outputStr += ` ${side} ${size} ${route}@${price}`;

      // Calculate the prices and size at the route/pair
      tradeLegs.push({
        price,
        size,
        side,
        product_id: route,
      });
    });
    logToFile(outputStr, true);

    // Tally the end price
    // Check the time - see if there are driffs
    const amountWithoutFees = chain.done();

    let fees = math.eval(amountWithoutFees * (TRANSACTION_FEE / 100));
    // Predict the transaction fee
    const endPrice = math.eval(amountWithoutFees - fees);

    // Profit in percentage
    const profit = math.eval((endPrice - initialAmount) / initialAmount * 100);

    const outcomeStr = `Initial: ${initialAmount}, Outcome > W/O fees: ${math.round(amountWithoutFees, 8)}, fees: ${math.round(fees, 8)}, W/ fees: ${math.round(endPrice, 8)}, profit: ${math.round(profit, 8)}%`;
    logToFile(outcomeStr, true);

		const shouldTrade = math.larger(profit, PROFIT_THRESHOLD);
    // See if make the trade or not
    // todo: Also check the profit as well
    if (math.larger(endPrice, initialAmount)) {
      if (shouldTrade) {
        logToFile('TRADE - YES!', true);
        placeTrade(tradeLegs);

        // Increase the trade found
        STATE.PROFITABLE_TRADES += 1;
      } else {
        logToFile('TRADE - NO! not above threshold profit', true);
      }
    } else {
      logToFile('TRADE - NOOOOOOOOOOOOOOOOOO!', true);
    }

		const routesCsv = tradeLegs.map(leg => leg.price);
		// Log the data to csv for reference
		let currentTime = new Date();
		const ts = `${currentTime.getFullYear()}-${currentTime.getMonth() + 1}-${currentTime.getDate()} ${currentTime.getHours()}:${currentTime.getMinutes()}:${currentTime.getSeconds()}`;
		const csvLine = `${ts},${initialAmount},${endPrice},${profit},${shouldTrade},${routesCsv.join(',')}\n`;
		//logToFile(csvLine, true);
		fs.appendFile(DATA_FD, csvLine, () => {});
  } catch (error) {
    logToFile('Error while doing triangulation', true);
    logToFile(error);
  }
}

function placeTrade(tradeLegs) {
  logToFile('going to place trade');
  logToFile(tradeLegs);

  if (STATE.STOP) {
    // Only one trade at a time
    logToFile('Stop! - no more trades', true);
    return true;
  }

  // Not able to place more order queue if there are items in the queue
  if (STATE.ORDER_QUEUE.length > 0) {
    // Only one trade at a time
    logToFile('The order queue is not empty - previous trade not filled yet', true);
    return true;
  }

  // Push the order onto the queue
  tradeLegs.forEach((tradeLeg, index) => {
    const clientId = uuid();

    // Push the ordere to the queue
    let param = {
      side: tradeLeg.side,
      type: 'limit',
      price: tradeLeg.price,
      size: tradeLeg.size,
      product_id: tradeLeg.product_id,
      client_oid: clientId,
    };

    // Push the order to order queue
    STATE.ORDER_QUEUE.push(param);

    // Make a not of the uuid order mapping
    STATE.UUID_ORDER_MAPPING[clientId] = true;

    // Log it
    logToFile(`Push trade to order queue: ${param.side} ${param.size} ${param.product_id}@${param.price}`, true);
    logToFile(param);

    // Increase the trade found
    STATE.TRADES_PLACED += 1;
  })
}

// Update prices to the latest
function updatePrices(data) {
  if (data.sequence > STATE.PRICES[data.product_id].sequence) {
    //logToFile(`going to update the price ${data.product_id} > ${data.price}`, true);
    STATE.PRICES[data.product_id]['trade_id'] = data.trade_id;
    STATE.PRICES[data.product_id]['price'] = data.price;
    STATE.PRICES[data.product_id]['size'] = data.size;

    // Check out which side
    if (data.side === 'buy') {
      STATE.PRICES[data.product_id]['bid'] = data.price;
    } else {
      STATE.PRICES[data.product_id]['ask'] = data.price;
    }

    STATE.PRICES[data.product_id]['sequence'] = data.sequence;
    STATE.PRICES[data.product_id]['time'] = data.price;
  }
}

// Order life cycle
// Received > open/matched/change > done
function updateOrderLifeCycle(orderId, data) {
  logToFile('Going to update order life cycle');
  logToFile(data);

  // Check the order is relavent to us or not
  STATE.CURRENT[orderId].histories.push(data);
  logToFile('update order life cycle STATE.CURRENT');
  logToFile(STATE.CURRENT);
  switch (data.type) {
    case 'match':
    case 'received':
    case 'open':
    case 'change':
      break;
    case 'done':
      logToFile(`Done - orderId: ${orderId}`, true);

      // Delete it from the current and move it into history
      STATE.HISTORIES.push(STATE.CURRENT[orderId]);

      logToFile('Done - changing the trading to false', true);
      // Now a trading is finish
      STATE.TRADING = false;

      // Find the uuid corresponding to the order id and delete it
      // This is mark as the current task is done
      /*
      let clientId = _.findKey(STATE.UUID_ORDER_MAPPING, (t) => t === orderId);
      if (clientId) {
        logToFile(`Delete the client id off STATE.UUID_ORDER_MAPPING: ${clientId} > ${orderId}`, true);
        delete STATE.UUID_ORDER_MAPPING[clientId];
      }
      */

      // Delay the delete
      setTimeout(() => {
        delete STATE.CURRENT[orderId];
      }, 4000);
      break;
    default:
      // Do nothing
  }
}

function initWs(websocket) {
  websocket.on('message', data => {
    // Log everything
    // logToFile('New message');
    // logToFile(data);

    let orderId = null;
    // Only get orders we interested about
    switch (data.type) {
      case 'received':
        // Check if we have client oid mapping on local
        if (STATE.UUID_ORDER_MAPPING[data.client_oid]) {
          STATE.UUID_ORDER_MAPPING[data.client_oid] = orderId = data.order_id;

          // Check if its in the current or not
          // Create one if its no in the current
          // because ws is faster than rest api
          // so create histories in here
          // The order will get update
          if (!STATE.CURRENT[orderId]) {
            STATE.CURRENT[orderId] = {
              histories: [],
            }
          }
        }
        break;
      case 'match':
        updatePrices(data);

        // Check if our orders are in there or not
        if (STATE.CURRENT[data.maker_order_id]) {
          orderId = data.maker_order_id;
        } else if (STATE.CURRENT[data.taker_order_id]) {
          orderId = data.taker_order_id;
        }
        break;
      case 'heartbeat':
        break;
      default:
        // Check if there is our orders or not
        if (data.order_id) {
          orderId = data.order_id;
        }
    }

    // Update the order
    if (STATE.CURRENT[orderId]) {
      updateOrderLifeCycle(orderId, data);
    }
  });

  // In case there are errors
  websocket.on('error', err => {
    console.error('error', err);
  });

  // Close everything
  websocket.on('close', () => {
    console.error('close');
  });
}

let Exchange = null;
async function init() {

  // Get Exchange
  Exchange = require('./gdax.js')(ROUTES);

  // Init the prices
  STATE.PRICES = await Exchange.getPrices(ROUTES);

  // Get the initial account
  STATE.ACC.beginning = STATE.ACC.current = await Exchange.getAccounts();

  // Init the websockets
  initWs(Exchange.websocket);

	// Todo: check there are account for all the ticker in the routes first before start
	
  // The main loop
  setInterval(() => {
    // Get the account first, so we know how much can be use
    Exchange.getAccounts().then((data) => {
      // Set the current account
      STATE.ACC.current = data;

      // Do the triangulation
      triangular(ROUTES);

      // Log the state
      //logToFile('STATE object');
      //logToFile(STATE);
    }).catch((error) => {
      logToFile('Error: can not get account', true);
      logToFile(error);
    });

    /*
		if (STATE.STOP) {
			return true;
		}
    */
  }, UPDATE_INTERVAL);

  // Do the test
  //let testTrades = require('./test')({ Exchange, placeTrade, logToFile, });

  // Loop for execute the order
  setInterval(waterfallTradeWorker, ORDER_EXECUTE_INTERVAL);

  // Update the screen
  if (typeof screen !== 'undefined') {
    setInterval(screen.update, ORDER_EXECUTE_INTERVAL);
  }
}

// Waterfall trade worker
// Only one trade at a time
// total orders in the queue should be equal to routes length
function waterfallTradeWorker() {
  if (STATE.TRADING) {
    return false;
  } else {
    // Check if ther eare things on the queue or not
    if (STATE.ORDER_QUEUE.length > 0) {
      logToFile('waterfall trade worker, going to execute order and take one off the order queue', true);
      logToFile(STATE.ORDER_QUEUE);
      // Execute the order
      executeOrder(STATE.ORDER_QUEUE.shift());
    }
  }
}

// Execute order
async function executeOrder(param) {
  // Set trading to true
  STATE.TRADING = true;

  // Going to execute order
  logToFile('Execute order', true);
  logToFile(param);

  //place order
  let order = await Exchange.placeOrder(param);

  logToFile('after waiting to place the order', true);
  logToFile(order);

  // Put the order into the current
  if (order && order.id) {
    // If the order is already there, then just update the order
    // Because the websocket will received the message fast then rest api
    if (STATE.CURRENT[order.id]) {
      logToFile('after waiting to place the order - update the existing order in current', true);
      STATE.CURRENT[order.id]['order'] = order;
    } else {
      logToFile('after waiting to place the order - going to create a new entry in current', true);
      STATE.CURRENT[order.id] = {
        order,
        histories: [],
      };
    }

    logToFile('After success placed order', true);
    logToFile(STATE.CURRENT);
  } else {
    // todo wath todo if the trade doesn't go through
    logToFile('order not going through:' + JSON.stringify(order), true);
    STATE.TRADING = false;

    // Cancel all of the orders
    STATE.ORDER_QUEUE = [];
  }
}

function logToFile(data, toConsole) {
  let d = new Date();
  const str = d + ':' + JSON.stringify(data) + "\n";
  fs.appendFile(FD, str, () => {});

  if (toConsole) {
    if (typeof screen === 'undefined') {
      console.log(str);
    } else {
      const ds = `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
      screen.liveDisplay.log(ds + ':' + JSON.stringify(data));
    }
  }
}

// Create an csv file
const startDate = new Date();
const ts = `${startDate.getFullYear()}-${startDate.getMonth() + 1}-${startDate.getDate()}`;
const FileName = `./output/${ROUTES.join('_')}_${ts}_${startDate.getTime()}.log`;
const dataFileName = `./output/${ROUTES.join('_')}_${ts}_${startDate.getTime()}.csv`;
let FD = null;
let DATA_FD = null;

// Open log file
fs.open(FileName, 'a', (error, fd) => {
  FD = fd;

  logToFile('Starting');
	fs.open(dataFileName, 'a', (error, fd) => {
		// Check if the file is empty or not, then add header
		DATA_FD = fd;
		fstat = fs.fstatSync(fd);
		if (fstat.size == 0) {
			fs.appendFile(DATA_FD, `date,initialAmount,endPrice,profile,trade,${ROUTES.join(',')}\n`, () => {});
		}

		// Start
		init();
	})
});

// Error handlers
function handleShutdown() {
  logToFile('Handle shutdown', true);

  // Stop everything
  STATE.STOP = true;

  return new Promise(async (resolve, reject) => {
    console.log('Shutdown handler');
    // Clean up stuff
    
    // Stop all trade

    // Wait for all trade to finish
    let i = 0;
    let clear = false;
    do {
      //console.log('Check if there is no orders executing', Object.keys(STATE.CURRENT));
      if (_.isEmpty(STATE.CURRENT)) {
        //console.log('STATE.CURRENT is empty');
        clear = true;
      }

      // Todo: maybe cancel if its the first order on the queue

      // sleep for a bit
      await sleep(1000);

			// Only attempt 50 times
      if (i++ > 50) {
        //console.log('counter greater than 50');
        //clear = true;
      }
    } while (clear === false);

    resolve(clear);
  });
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

process.on('exit', async () => {
  await handleShutdown();
});

process.on('SIGINT', async () => {
  await handleShutdown();

  // Exit
  process.exit();
});

// State
const STATE = require('./state');
const utils = require('./utils');

// Display
const _ = require('lodash');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const screen = blessed.screen({
  //log: true,
});
const grid = new contrib.grid({rows: 12, cols: 12, screen: screen});

screen.log('starting it now');
//grid.set(row, col, rowSpan, colSpan, obj, opts)
var pricesDisplay = grid.set(0, 0, 3, 3, contrib.table, {
  keys: true,
  interactive: true,
  columnSpacing: 2,
  columnWidth: [10, 10, 10, 10],
  label: 'Prices',
  tags: true,
  style: {
		focus: {
			border: {
				fg: 'red',
				bg: 'red',
			},
		},
  },
});

pricesDisplay.focus();

// Display
var lcdDisplay = grid.set(3, 0, 2, 3, contrib.lcd, {
  elementSpacing: 4,
  elementPadding: 2,
  strokeWidth: 0.11,
  segmentInterval: 0.11,
  segmentWidth: 0.06,
  elements: 4,
  display: 'state',
  color: 'green',
  keys: true,
  interactive: true,
  label: 'State',
  tags: true,
  style: {
		focus: {
			border: {
				fg: 'red',
				bg: 'red',
			},
		},
  },
});

var summaryDisplay = grid.set(5, 0, 1, 3, contrib.markdown, {
  keys: true,
  interactive: true,
  label: 'Summary',
  tags: true,
  style: {
		focus: {
			border: {
				fg: 'red',
				bg: 'red',
			},
		},
  },
});


// Live display
var liveDisplay = grid.set(0, 3, 6, 6, contrib.log, {
  bufferLength: 50,
  label: 'Live',
  tags: true,
  wrap: true,
  style: {
		focus: {
			border: {
				fg: 'red',
			},
		},
  },
});

// Display accounts
var accountsDisplay = grid.set(6, 0, 6, 3, contrib.table, {
  keys: true,
  interactive: true,
  columnSpacing: 2,
  columnWidth: [3, 20, 20],
  label: 'Accounts',
  tags: true,
  style: {
		focus: {
			border: {
				fg: 'red',
			},
		},
  },
});

var queueDisplay = grid.set(6, 3, 6, 3, contrib.table, {
  keys: true,
  interactive: true,
  columnSpacing: 2,
  columnWidth: [3, 60],
  label: 'Order Queue',
  tags: true,
  style: {
		focus: {
			border: {
				fg: 'red',
			},
		},
  },
});

// Current orders
var currentOrdersDisplay = grid.set(6, 6, 6, 3, contrib.table, {
  keys: true,
  interactive: true,
  columnSpacing: 2,
  columnWidth: [3, 30, 30],
  label: 'Current Orders',
  tags: true,
  style: {
		focus: {
			border: {
				fg: 'red',
			},
		},
  },
});

var historiesDisplay = grid.set(0, 9, 12, 3, contrib.table, {
  keys: true,
  interactive: true,
  columnSpacing: 2,
  columnWidth: [3, 30, 30],
  label: 'Trade Histories',
  bufferLength: 100,
  tags: true,
  style: {
		focus: {
			border: {
				fg: 'red',
			},
		},
  },
});

screen.key(['escape', 'q', 'C-c'], async function(ch, key) {
  await handleShutdown();

  return process.exit(0);
});

screen.key(['s'], async function(ch, key) {
	// Stop everything
	STATE.STOP = !STATE.STOP;
});

// Clear everything on the queue
screen.key(['c'], async function(ch, key) {
  console.log('Stop and clear the order queue');
	// Stop everything
	STATE.STOP = !STATE.STOP;

  STATE.ORDER_QUEUE = [];
});


screen.key(['h'], function(ch, key) {
	var popup = grid.set(3, 3, 6, 6, blessed.Message, {label: 'Help', tags: true})
	popup.log('Help {underline}me!{/underline}', 0);
	screen.render();
});

screen.key(['1'], async function(ch, key) {
	pricesDisplay.focus();
});
screen.key(['2'], async function(ch, key) {
	accountsDisplay.focus();
});
screen.key(['3'], async function(ch, key) {
	queueDisplay.focus();
});
screen.key(['4'], async function(ch, key) {
	currentOrdersDisplay.focus();
});
screen.key(['5'], async function(ch, key) {
	historiesDisplay.focus();
});
screen.key(['6'], async function(ch, key) {
	liveDisplay.focus();
});

// fixes https://github.com/yaronn/blessed-contrib/issues/10
screen.on('resize', function() {
	pricesDisplay.emit('attach');
	currentOrdersDisplay.emit('attach');
	accountsDisplay.emit('attach');
	queueDisplay.emit('attach');
	historiesDisplay.emit('attach');
	liveDisplay.emit('attach');
});

// Render the screen
screen.render();

function blessedStats() {
  try {
    if (STATE.STOP) {
      lcdDisplay.setDisplay('STOP');
      lcdDisplay.setOptions({
        color: 'red',
      });
    } else {
      lcdDisplay.setDisplay('LIVE');
      lcdDisplay.setOptions({
        color: 'green',
      });
    }

    // Update summary
    let summaryContent = '';
    if (STATE.TRADING) {
      summaryContent += '# Trading\n';
    } else {
      summaryContent += '# Not Trading\n';
    }
    summaryContent += `# Profitable Trades: ${STATE.PROFITABLE_TRADES}\n`;
    summaryContent += `# Trades Placed: ${STATE.TRADES_PLACED}\n`;

    summaryDisplay.setMarkdown(summaryContent);

    // Update the account
    const accountData = _.map(STATE.ACC.beginning.acc, (acc, currency) => {
      let currentAcc = STATE.ACC.current.acc[currency];

      return [
        currency,
        `${utils.formatCurrency(currency, acc.available)}/${utils.formatCurrency(currency, acc.balance)}`,
        `${utils.formatCurrency(currency, currentAcc.available)}/${utils.formatCurrency(currency, currentAcc.balance)}`
      ];
    });
    accountsDisplay.setData({
      headers: ['ACC', 'beginning', 'Current'],
      data: accountData,
    });

    // Output the price
    const pricesData = _.map(STATE.PRICES, (price, ticker) => {
      return [
        ticker,
        utils.formatCurrency(ticker, price.price),
        utils.formatCurrency(ticker, price.ask),
        utils.formatCurrency(ticker, price.bid),
      ];
    });
    pricesDisplay.setData({
      headers: ['Ticker', 'Price', 'Ask', 'Bid'],
      data: pricesData,
    });

    // Output queue items
    const queueData = STATE.ORDER_QUEUE.map((item, index) => {
      return [
        index,
        `${item.side} ${item.size} ${item.product_id}@${item.price}`,
      ];
    });
    queueDisplay.setData({
      headers: ['No.', ''],
      data: queueData,
    });

    // Output current order
    const currentData = _.map(STATE.CURRENT, (val, key) => {
      let order = 'Pending';
      if (val.order) {
        order = `${val.order.side} ${val.order.size} ${val.order.product_id}@${val.order.price}`;
      }
      const his = val.histories.map((h) => h.type).join('->');
      return [
        key,
        order,
        his,
      ];
    });
    currentOrdersDisplay.setData({
      headers: ['No.', 'Order', 'Status'],
      data: currentData,
    });

    // Histories output
    const historiesData = _.map(STATE.HISTORIES, (val, key) => {
      const order = `${val.order.product_id} ${val.order.side} ${val.order.size}@${val.order.price}`;
      const his = val.histories.map((h) => h.type).join('->');
      return [
        key,
        order,
        his,
      ];
    });
    historiesDisplay.setData({
      headers: ['No.', 'Order', 'Status'],
      data: historiesData.reverse(),
    });

    // render the screen
    screen.render();
  } catch (error) {
    screen.log('Screen stats error');
    screen.log(error);
  }
}

let handleShutdown = null;
module.exports = function (shutdownHandler) {
  // Handle shutdown
  handleShutdown = shutdownHandler;

  return {
    liveDisplay,
    update: blessedStats,
  }
}

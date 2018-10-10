// The contract global state
// todo: list the the type of each global state
module.exports = {
  // Test mode or not
  SANDBOX: false,

  // Allow global stop everything
  STOP: true,

  // Global trading state
  TRADING: false,

  // Local uuid to order mapping
  UUID_ORDER_MAPPING: {},

  // Latest prices for routes
  PRICES: {},

  // Trade histories
  HISTORIES: [],

  // Current trades
  // Each trade/order should have client_oid with leg 1, 2 and 3 etc
  CURRENT: {},

  // Order queue
  ORDER_QUEUE: [],

  // Trades found
  PROFITABLE_TRADES: 0,

  // Placed trades
  TRADES_PLACED: 0,

  // Account balances
  ACC: {
    beginning: {},
    current: {},
  },
}

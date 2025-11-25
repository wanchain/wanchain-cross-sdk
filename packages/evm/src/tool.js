const checkEnable = (accounts) => {
  if (!(Array.isArray(accounts) && accounts.length > 0)) {
    throw new Error('User denied account access');
  }
};

export { checkEnable };

export default {
  checkEnable
};

const BarangayRecords = artifacts.require("BarangayRecords");

module.exports = function (deployer) {
  deployer.deploy(BarangayRecords);
};

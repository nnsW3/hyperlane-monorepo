require('@nomiclabs/hardhat-waffle');
const ethers = require('ethers');
const { extendEnvironment } = require('hardhat/config');

const HomeAbi = require('./Home.abi.json');
const ReplicaAbi = require('./ProcessingReplica.abi.json');

extendEnvironment((hre) => {
  class Common extends ethers.Contract {
    constructor(address, abi, providerOrSigner) {
      super(address, abi, providerOrSigner);
    }

    async submitDoubleUpdate(left, right) {
      if (left.oldRoot !== right.oldRoot) {
        throw new Error('Old roots do not match');
      }
      return await this.doubleUpdate(
        right.oldRoot,
        [left.newRoot, right.newRoot],
        left.signature,
        right.signature,
      );
    }
  }

  class Home extends Common {
    constructor(address, providerOrSigner) {
      super(address, HomeAbi, providerOrSigner);
    }

    async submitSignedUpdate(update) {
      return await this.update(
        update.oldRoot,
        update.newRoot,
        update.signature,
      );
    }
  }

  class Replica extends Common {
    constructor(address, providerOrSigner) {
      super(address, ReplicaAbi, providerOrSigner);
    }

    async submitSignedUpdate(update) {
      return await this.update(
        update.oldRoot,
        update.newRoot,
        update.signature,
      );
    }
  }

  class Updater {
    constructor(signer, address, originSlip44, disableWarn) {
      if (!disableWarn) {
        throw new Error('Please use `Updater.fromSigner()` to instantiate.');
      }
      this.originSlip44 = originSlip44 ? originSlip44 : 0;
      this.signer = signer;
      this.address = address;
    }

    static async fromSigner(signer, originSlip44) {
      return new Updater(signer, await signer.getAddress(), originSlip44, true);
    }

    domain() {
      return ethers.utils.solidityKeccak256(
        ['uint32', 'string'],
        [this.originSlip44, 'OPTICS'],
      );
    }

    message(oldRoot, newRoot) {
      return ethers.utils.concat([this.domain(), oldRoot, newRoot]);
    }

    async signUpdate(oldRoot, newRoot) {
      let message = this.message(oldRoot, newRoot);
      let msgHash = ethers.utils.arrayify(ethers.utils.keccak256(message));
      let signature = await this.signer.signMessage(msgHash);
      return {
        origin: this.originSlip44,
        oldRoot,
        newRoot,
        signature,
      };
    }
  }

  const getHomeFactory = async (...args) =>
    ethers.getContractFactory('Home', ...args);
  const getReplicaFactory = async (...args) =>
    ethers.getContractFactory('ProcessingReplica', ...args);

  hre.optics = {
    Common,
    Home,
    Replica,
    Updater,
    getHomeFactory,
    getReplicaFactory,
    deployHome: async (signer, ...args) => {
      let contract = await (await getHomeFactory(signer)).deploy(...args);
      await contract.deployed();
      return new Home(contract.address, signer);
    },
    deployReplica: async (signer, ...args) => {
      let contract = await (await getReplicaFactory(signer)).deploy(...args);
      await contract.deployed();
      return new Replica(contract.address, signer);
    },
  };
});
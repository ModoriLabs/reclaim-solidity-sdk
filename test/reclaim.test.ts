import {
  CompleteClaimData,
  createSignDataForClaim,
  fetchWitnessListForClaim,
  hashClaimInfo
} from '@reclaimprotocol/crypto-sdk'

import { Identity } from '@semaphore-protocol/identity'
import { Group } from '@semaphore-protocol/group'
import { generateProof } from '@semaphore-protocol/proof'
import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { Reclaim, contracts } from '../src/types'
import {
  deployReclaimContract,
  generateMockWitnessesList,
  randomEthAddress,
  randomWallet,
  randomiseWitnessList
} from './utils'
import { ethers, run, upgrades } from 'hardhat'

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { randomBytes } from 'crypto'

import { deployFixture, proofsFixture } from './fixtures'

describe('Reclaim Tests', () => {
  const NUM_WITNESSES = 5
  const MOCK_HOST_PREFIX = 'localhost:555'

  it('should fail to execute admin functions if not owner', async () => {
    let { contract, witnesses } = await loadFixture(deployFixture)
    const NOT_OWNER_MSG = 'Ownable: caller is not the owner'
    const user = await randomWallet(1, ethers.provider)
    contract = contract.connect(user)

    const expectedRejections = [() => contract.addNewEpoch(witnesses, 5)]
    for (const reject of expectedRejections) {
      expect(reject()).to.be.revertedWith(NOT_OWNER_MSG)
    }
  })

  it('should insert some epochs', async () => {
    let { contract, witnesses } = await loadFixture(deployFixture)
    const currentEpoch = await contract.currentEpoch()
    for (let i = 1; i < 5; i++) {
      const tx = await contract.addNewEpoch(witnesses, 5)
      await tx.wait()
      // current epoch
      const epoch = await contract.fetchEpoch(0)
      expect(epoch.id).to.be.eq(currentEpoch + i)
      expect(epoch.witnesses).to.have.length(NUM_WITNESSES)
      expect(epoch.timestampStart).to.be.gt(0)

      const epochById = await contract.fetchEpoch(epoch.id)
      expect(epochById.id).to.be.eq(epoch.id)
    }
  })

  it('emit an event after creating a group', async () => {
    let { contract } = await loadFixture(deployFixture)
    expect(await contract.createGroup('test', 18)).to.emit(
      contract,
      'GroupCreated'
    )
  })

  it('should fail to create group with Reclaim__GroupAlreadyExists error', async () => {
    let { contract } = await loadFixture(deployFixture)
    expect(await contract.createGroup('test', 18)).to.emit(
      contract,
      'GroupCreated'
    )

    expect(contract.createGroup('test', 18)).to.be.revertedWith(
      'Reclaim__GroupAlreadyExists'
    )
  })
  describe('Proofs tests', async () => {
    it('should verify a claim', async () => {
      let { contract, user, superProofs, } = await loadFixture(proofsFixture)
      let x = await contract.connect(user).verifyProof(superProofs[1])
    })

    it('should simulate proof verification - twitter follower count', async () => {
      let { contract, owner } = await loadFixture(deployFixture)
      // proxy address, host is not checked in Reclaim.sol now.
      const witnesses = [{addr:"0x189027e3c77b3a92fd01bf7cc4e6a86e77f5034e", host:"api.twitter.com"}]
      await contract.addNewEpoch(witnesses, 1)
      await contract.fetchEpoch(1)
      const proof = {
        claimInfo: {
          provider: 'http',
          parameters: '{"method":"GET","responseMatches":[{"type":"regex","value":"followers_count\\":\\\\s*(?<followers_count>[\\\\d\\\\.]+)"}],"url":"https://api.twitter.com/2/users/by/username/anime_kaguya?user.fields=public_metrics"}',
          context: '{"extractedParameters":{"followers_count":"473022"},"providerHash":"0x12700638dc2514ec6c1608afc479d979d05c545cf0da29d2434ca2dbbf533600"}',
        },
        signedClaim: {
          claim: {
            epoch: 1,
            identifier: '0x9e19819f75fe9a5440fc89505225f27104e85ca9456cf71ce441131e08ccd2f3',
            owner: '0xf9f25d1b846625674901ace47d6313d1ac795265',
            timestampS: 1731312831,
          },
          signatures: [
            // claim signature
            '0x5303b18942e4a2f395afc9485def2f0cb1b0649ce957df508dcc607f6d539ec6747197c9495c84d1229ca336c00b37335f461bb21955be2294047e4553760d961b',
            // result signature
            // '0x597e918d26fbbad5e571871a54fa8e7c4858639086acc386aa3e129bbb38c45d77ff10f54518b32b5c54a4edf36cb1f8a28803843abb794121aeb0f6d921db951c',
          ],
        }
      }

      const tx = await contract.verifyProof(proof)
      await tx.wait() // this function is not view, so return value is meaningless
      const count = await contract.extractFieldFromContext(proof.claimInfo.context, '"followers_count":"')
      expect(count).to.equal('473022');
    })

    it('should simulate proof verification - github qpzm', async () => {
      let { contract, owner } = await loadFixture(deployFixture)
      const witnesses = [{addr:"0x244897572368eadf65bfbc5aec98d8e5443a9072", host:"wss://witness.reclaimprotocol.org/ws"}]
      await contract.addNewEpoch(witnesses, 1)
      await contract.fetchEpoch(1)
      const proof = {
        claimInfo: {
          provider: 'http',
          parameters: '{"additionalClientOptions":{},"body":"","geoLocation":"","headers":{"user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1"},"method":"GET","paramValues":{"username":"qpzm"},"responseMatches":[{"invert":false,"type":"contains","value":"<span class=\\"color-fg-muted\\">({{username}})</span>"}],"responseRedactions":[{"jsonPath":"","regex":"<span\\\\ class=\\"color\\\\-fg\\\\-muted\\">\\\\((.*)\\\\)</span>","xPath":""}],"url":"https://github.com/settings/profile"}',
          context: '{"contextAddress":"0x0","contextMessage":"","extractedParameters":{"username":"qpzm"},"providerHash":"0x74734677e529e5d823b3a2845799a908ab59d2afa9ac168c6fd5d57d1b0e319f"}',
        },
        signedClaim: {
          claim: {
            epoch: 1,
            identifier: '0x38857161784f3a3ae27d411909ef5a55606901525e6390267a82f7bc141a3ba8',
            owner: '0xe57ab8012af3becf06d18b679f4a48d0c0865294',
            timestampS: 1728025483,
          },
          signatures: [
            '0xc754c9acb205dfbf8b06c5bab3ae4083ed19a4cc3732c5da23f6e54f8f667cf7444b837576ce4b0005a0f00287b609ab8d61a252fb75e14f15c75addf9ecfdc41b'
          ],
        }
      }

      const result = await contract.verifyProof(proof)
    })

    it('should simulate proof verification', async () => {
      let { contract, owner } = await loadFixture(deployFixture)
      const witnesses = [{addr:"0x244897572368eadf65bfbc5aec98d8e5443a9072",host:"https://reclaim-node.questbook.app"}]
      await contract.addNewEpoch(witnesses, 1)
      await contract.fetchEpoch(1)
      const proof = {

        claimInfo: {

          context: '{"contextAddress":"0x0","contextMessage":"0098967F","providerHash":"0xeda3e4cee88b5cbaec045410a0042f99ab3733a4d5b5eb2da5cecc25aa9e9df1"}',

          provider: 'http',

          parameters: '{"body":"","geoLocation":"in","method":"GET","responseMatches":[{"type":"contains","value":"_steamid\\">Steam ID: 76561198155115943</div>"}],"responseRedactions":[{"jsonPath":"","regex":"_steamid\\">Steam ID: (.*)</div>","xPath":"id(\\"responsive_page_template_content\\")/div[@class=\\"page_header_ctn\\"]/div[@class=\\"page_content\\"]/div[@class=\\"youraccount_steamid\\"]"}],"url":"https://store.steampowered.com/account/"}'

        },

        signedClaim: {

          claim: {

            epoch: 1,

            identifier: '0x930a5687ac463eb8f048bd203659bd8f73119c534969258e5a7c5b8eb0987b16',

            owner: '0xef27fa8830a070aa6e26703be6f17858b61d3fba',

            timestampS: 1712685785

          },

          signatures: [

            '0xb246a05693f3e21a70eab5dfd5edc1d0597a160c82b8bf9e24d1f09f9dde9899154bb1672c1bf38193a7829e96e4ed09bc327657bf266e90451f6a90c8b45dfb1c'

          ]

        }

      }
      const result = await contract.verifyProof(proof)
    })

    it('should return the provider name from the proof', async () => {
      let { contract, superProofs } = await loadFixture(proofsFixture)
      const result = await contract.getProviderFromProof(superProofs[0])
      expect(result).to.equal(superProofs[0].claimInfo.provider)
    })

    it('should extract providerHash from context', async () => {
      let { contract } = await loadFixture(proofsFixture)
      const ctx = "{\"contextAddress\":\"0x00000000000\",\"contextMessage\":\"hi there\",\"providerHash\":\"0x3246874620eacad8b93e3e05e5d5bb5877c9bed5ddcaf9b4f6cf291e0fb3c64e\"}"
      const trgt = '"providerHash":"'
      const hash = "0x3246874620eacad8b93e3e05e5d5bb5877c9bed5ddcaf9b4f6cf291e0fb3c64e"
      const result = await contract.extractFieldFromContext(ctx, trgt)
      expect(result).to.equal(hash)
    })

    it('should extract contextMessage from context', async () => {
      let { contract } = await loadFixture(proofsFixture)
      const ctx = "{\"contextAddress\":\"0x00000000000\",\"contextMessage\":\"hi there\",\"providerHash\":\"0x3246874620eacad8b93e3e05e5d5bb5877c9bed5ddcaf9b4f6cf291e0fb3c64e\"}"
      const trgt = '"contextMessage":"'
      const message = "hi there"
      const result = await contract.extractFieldFromContext(ctx, trgt)
      expect(result).to.equal(message)
    })

    it('should create unique groupId for each provider', async () => {
      let { contract } = await loadFixture(proofsFixture)
      const providersMock = ['google-account', 'github-cred', 'account-google']
      const groupIds: Set<Number> = new Set()
      for (let provider of providersMock) {
        const txReceipt = await (
          await contract.createGroup(provider, 18)
        ).wait()
        if (
          txReceipt.events !== undefined &&
          txReceipt.events[2].args !== undefined
        ) {
          groupIds.add(txReceipt.events[2].args[0].toNumber())
        }
      }
      expect(providersMock.length).to.equal(groupIds.size)
    })

    it('should contract be admin, merkelize the user, create dapp and verify merkle identity', async () => {
      let { contract, superProofs, semaphore, witnesses } = await loadFixture(
        proofsFixture
      )

      // Creating group and add member through recalim
      const tx = await contract.createGroup(
        superProofs[1].claimInfo.provider,
        20
      )
      const txReceipt = await tx.wait(1)
      let groupId
      if (
        txReceipt.events !== undefined &&
        txReceipt.events[2].args !== undefined
      ) {
        groupId = txReceipt.events[2].args[0].toString()
      }

      const identity = new Identity()
      const member = identity.getCommitment().toString()
      const txMerkelizeFirstUser = await contract.merkelizeUser(
        superProofs[1],
        member
      )
      await txMerkelizeFirstUser.wait()
      await expect(txMerkelizeFirstUser).to.emit(semaphore, 'MemberAdded')

      const admin = (await semaphore.groups(groupId)).admin
      expect(contract.address).to.equal(admin)

      let group = new Group(groupId)
      group.addMember(member)

      const signal = utils.formatBytes32String('Hellox')
      const id = group.root
      const createDappTranactionResponse = await contract.createDapp(id)
      expect(createDappTranactionResponse).to.emit(contract, 'DappCreated')

      const createDappTransactionReceipt =
        await createDappTranactionResponse.wait()

      const dappId = createDappTransactionReceipt.events![0]!.args![0]!

      const fullProof = await generateProof(identity, group, id, signal, {
        zkeyFilePath: './resources/semaphore.zkey',
        wasmFilePath: './resources/semaphore.wasm'
      })

      const semaphoreTransaction = await contract.verifyMerkelIdentity(
        superProofs[1].claimInfo.provider,
        fullProof.merkleTreeRoot,
        fullProof.signal,
        fullProof.nullifierHash,
        fullProof.externalNullifier,
        dappId,
        fullProof.proof
      )
      await expect(semaphoreTransaction)
        .to.emit(semaphore, 'ProofVerified')
        .withArgs(
          groupId,
          fullProof.merkleTreeRoot,
          fullProof.nullifierHash,
          fullProof.externalNullifier,
          fullProof.signal
        )
    })

    it('should merkelize user and create group in one call', async () => {
      let { contract, superProofs, semaphore } = await loadFixture(
        proofsFixture
      )
      const identity = new Identity()
      const member = identity.getCommitment().toString()
      const tx = await contract.merkelizeUser(superProofs[1], member)
      expect(tx).to.emit(contract, 'GroupCreated')
    })

    it('should fail to merkelize the user twice with UserAlreadyMerkelized error', async () => {
      let { contract, superProofs, semaphore } = await loadFixture(
        proofsFixture
      )
      const identity = new Identity()
      const member = identity.getCommitment().toString()
      const tx = await contract.merkelizeUser(superProofs[1], member)

      await expect(
        contract.merkelizeUser(superProofs[1], member)
      ).to.be.revertedWithCustomError(
        contract,
        'Reclaim__UserAlreadyMerkelized'
      )
    })
    it('should fail to verifyMerkleIdentity with Dapp Not Created error', async () => {
      let { contract, superProofs, semaphore } = await loadFixture(
        proofsFixture
      )

      const identity = new Identity()
      const member = identity.getCommitment().toString()

      // Creating group and add member through recalim
      const tx = await contract.createGroup(
        superProofs[1].claimInfo.provider,
        20
      )
      const txReceipt = await tx.wait(1)
      const txMerkelize = await contract.merkelizeUser(superProofs[1], member)
      await txMerkelize.wait()

      // get groupId from events
      let groupId = txReceipt.events![2]!.args![0]!.toString()

      let group = new Group(groupId)
      group.addMember(member)

      const signal = utils.formatBytes32String('Hellox')

      const fullProof = await generateProof(
        identity,
        group,
        group.root,
        signal,
        {
          zkeyFilePath: './resources/semaphore.zkey',
          wasmFilePath: './resources/semaphore.wasm'
        }
      )

      const verifyMerkelIdentityTransactionPromise =
        contract.verifyMerkelIdentity(
          groupId,
          fullProof.merkleTreeRoot,
          fullProof.signal,
          fullProof.nullifierHash,
          fullProof.externalNullifier,
          groupId,
          fullProof.proof
        )

      expect(verifyMerkelIdentityTransactionPromise).to.be.revertedWith(
        'Dapp Not Created'
      )
    })

    it('should fail to merkelize user with no signatures error', async () => {
      let { contract, superProofs, semaphore } = await loadFixture(
        proofsFixture
      )
      const identity = new Identity()

      const member = identity.getCommitment().toString()

      await contract.createGroup(superProofs[1].claimInfo.provider, 20)

      superProofs[1].signedClaim.signatures = []
      expect(contract.merkelizeUser(superProofs[1], member)).to.be.revertedWith(
        'No signatures'
      )
    })

    it('should fail to merkelize user with number of signatures not equal to number of witnesses error', async () => {
      let { contract, superProofs, semaphore } = await loadFixture(
        proofsFixture
      )
      const identity = new Identity()

      const member = identity.getCommitment().toString()

      await contract.createGroup(superProofs[1].claimInfo.provider, 20)

      superProofs[1].signedClaim.signatures.pop()

      expect(contract.merkelizeUser(superProofs[1], member)).to.be.revertedWith(
        'Number of signatures not equal to number of witnesses'
      )
    })

    it('should fail to merkelize user with signatures not appropriate error', async () => {
      let { contract, superProofs, semaphore } = await loadFixture(
        proofsFixture
      )
      const identity = new Identity()

      const member = identity.getCommitment().toString()

      await contract.createGroup(superProofs[1].claimInfo.provider, 20)

      superProofs[1].signedClaim.signatures.pop()
      superProofs[1].signedClaim.signatures = [
        randomBytes(12),
        ...superProofs[1].signedClaim.signatures
      ]

      expect(contract.merkelizeUser(superProofs[1], member)).to.be.revertedWith(
        'Signature not appropriate'
      )
    })

    it('should fail to create dapp with Dapp Already Exists error', async () => {
      let { contract, superProofs, semaphore } = await loadFixture(
        proofsFixture
      )
      const proposedDappId = Math.floor(Math.random() * 6) + 1
      const createDappTranactionResponse = await contract.createDapp(
        proposedDappId
      )

      expect(contract.createDapp(proposedDappId)).to.be.revertedWith(
        'Dapp Already Exists'
      )
    })
  })
})

describe('Reclaim Witness Fetch Tests', () => {
  const NUM_WITNESSES = 15
  const MOCK_HOST_PREFIX = 'localhost:555'
  let contract: Reclaim
  let witnesses: Reclaim.WitnessStruct[] = []

  beforeEach(async () => {
    const { semaphore } = await run('deploy:semaphore', {
      logs: false
    })

    contract = await deployReclaimContract(semaphore, ethers, upgrades)
    let { mockWitnesses } = await generateMockWitnessesList(
      NUM_WITNESSES,
      MOCK_HOST_PREFIX,
      ethers
    )
    witnesses = await randomiseWitnessList(mockWitnesses)
  })

  // check TS & solidity implementations match
  it('match fetchWitnessList implementation for claim', async () => {
    await contract.addNewEpoch(witnesses, 5)
    const currentEpoch = await contract.fetchEpoch(0)

    const identifier = hashClaimInfo({
      parameters: '1234',
      provider: 'test',
      context: 'test'
    })

    const timestampS = Math.floor(Date.now() / 1000)

    const witnessesTs = await fetchWitnessListForClaim(
      {
        epoch: currentEpoch.id,
        witnesses: currentEpoch.witnesses.map(w => ({
          id: w.addr,
          url: w.host
        })),
        witnessesRequiredForClaim:
          currentEpoch.minimumWitnessesForClaimCreation,
        nextEpochTimestampS: 0
      },
      identifier,
      timestampS
    )

    const witnessesContract = await contract.fetchWitnessesForClaim(
      currentEpoch.id,
      identifier,
      timestampS
    )

    const witnessesContractHosts = witnessesContract.length
    for (let i = 0; i < witnessesContractHosts; i++) {
      expect(witnessesContract[i].host.toLowerCase()).to.equal(
        witnessesTs[i].url.toLowerCase()
      )
    }
  })
})

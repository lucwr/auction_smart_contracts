import { deployments } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Ship, advanceBlockTo } from "../utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { GSPAuction, GSPAuction__factory, TestERC20, TestERC20__factory } from "../types";
import { parseUnits, solidityKeccak256 } from "ethers/lib/utils";

chai.use(solidity);
const { expect } = chai;

let ship: Ship;
let token: TestERC20;
let auction: GSPAuction;

let deployer: SignerWithAddress;
let alice: SignerWithAddress;
let bob: SignerWithAddress;

const setup = deployments.createFixture(async (hre) => {
  ship = await Ship.init(hre);
  const { accounts, users } = ship;
  await deployments.fixture(["gsp-auction"]);

  return {
    ship,
    accounts,
    users,
  };
});

describe.only("GSPAuction test", () => {
  const startBlock = 100;
  const biddingEndBlock = startBlock + 10;
  const revealEndBlock = startBlock + 20;

  before(async () => {
    const { accounts } = await setup();

    deployer = accounts.deployer;
    alice = accounts.alice;
    bob = accounts.bob;

    token = await ship.connect(TestERC20__factory);
    auction = await ship.connect(GSPAuction__factory);

    // distribute tokens to do test
    await token.connect(deployer).transfer(alice.address, parseUnits("10"));
    await token.connect(deployer).transfer(bob.address, parseUnits("10"));

    // approve tokens to auction contract
    await token.connect(deployer).approve(auction.address, parseUnits("100"));
    await token.connect(alice).approve(auction.address, parseUnits("100"));
    await token.connect(bob).approve(auction.address, parseUnits("100"));
  });

  it("auction params test", async () => {
    expect(await auction.assetType()).to.eq(1); // ERC20
    expect(await auction.assetAddress()).to.eq(token.address);
    expect(await auction.assetParam()).to.eq(parseUnits("1"));
    expect(await auction.bidToken()).to.eq(token.address);
  });

  it("start auction", async () => {
    await advanceBlockTo(startBlock - 1);
    await expect(auction.start(10, 10))
      .to.emit(auction, "AuctionStarted")
      .withArgs(startBlock, biddingEndBlock, revealEndBlock);

    expect(await token.balanceOf(auction.address)).to.eq(parseUnits("1"));
    expect(await auction.auctionStartBlock()).to.eq(startBlock);
    expect(await auction.biddingEndBlock()).to.eq(biddingEndBlock);
    expect(await auction.revealEndBlock()).to.eq(revealEndBlock);
  });

  it("bids", async () => {
    const aliceCommitment = solidityKeccak256(["uint256", "address"], [parseUnits("0.5"), alice.address]);
    const bobCommitment = solidityKeccak256(["uint256", "address"], [parseUnits("0.6"), bob.address]);

    await expect(auction.connect(alice).commitBid(aliceCommitment))
      .to.emit(auction, "NewBid")
      .withArgs(alice.address, aliceCommitment);

    await expect(auction.connect(bob).commitBid(bobCommitment))
      .to.emit(auction, "NewBid")
      .withArgs(bob.address, bobCommitment);

    // can't bid again
    await expect(auction.connect(alice).commitBid(aliceCommitment)).revertedWith(
      "Auction: already committed a bid",
    );
  });

  it("reveals", async () => {
    await expect(auction.connect(alice).revealBid(parseUnits("0.5"))).to.revertedWith(
      "Auction: reveal period isn't started or has ended",
    );

    await advanceBlockTo(biddingEndBlock);
    await expect(auction.connect(alice).revealBid(parseUnits("0.5")))
      .to.emit(token, "Transfer")
      .withArgs(alice.address, auction.address, parseUnits("0.5"))
      .to.emit(auction, "Revealed")
      .withArgs(alice.address, parseUnits("0.5"));

    expect(await auction.winningBidder()).to.eq(alice.address);
    expect(await token.balanceOf(auction.address)).to.eq(parseUnits("1.5"));

    await expect(auction.connect(bob).revealBid(parseUnits("0.5"))).to.revertedWith(
      "Auction: invalid commitment",
    );
    await expect(auction.connect(bob).revealBid(parseUnits("0.6")))
      .to.emit(token, "Transfer")
      .withArgs(bob.address, auction.address, parseUnits("0.6"))
      .to.emit(auction, "Revealed")
      .withArgs(bob.address, parseUnits("0.6"));

    expect(await auction.winningBidder()).to.eq(bob.address);
    expect(await token.balanceOf(auction.address)).to.eq(parseUnits("1.6"));
  });

  it("finish auction", async () => {
    await expect(auction.finish()).to.revertedWith("Auction: reveal period has not ended yet");

    await advanceBlockTo(revealEndBlock);

    await expect(auction.finish()).to.emit(auction, "Finished").withArgs(bob.address, parseUnits("0.5"));
    expect(await token.balanceOf(bob.address)).to.eq(parseUnits("10.5")); // 10 - 0.5 + 1
  });
});

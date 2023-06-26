// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ReentrancyGuard} from "./libraries/ReentrancyGuard.sol";

/**
 * @title Second Price Auction Contract
 * @dev There is a prize (NFT or some object with the owner property) which is being auctioned.
 *      At block n, the auction is started by the deployer of the contract. From some block t > n,
 *      players start submitting their bids (not necessarily in the same block).
 *      Players can submit their bid only once
 *      No player should be able to see/understand the bid of the other player
 *      The auctioneer should be able to compare all the bids and choose the highest bidder as the winner of the auction. The winner will get the prize and will pay the second highest bid.
 *      If two bids are equal then draw should be resolved with pseudo-random mechanism
 */
contract GSPAuction is ReentrancyGuard, Ownable {
  using SafeERC20 for IERC20;

  /// @dev asset type can be ERC20, ERC721 and ERC1155
  enum AssetType {
    ETH,
    ERC20,
    ERC721,
    ERC1155
  }

  struct Bid {
    bytes32 commitment;
    uint256 deposit;
    bool revealed;
  }

  /// @dev asset type
  AssetType public immutable assetType;
  /// @dev asset contract address
  address public immutable assetAddress;
  /// @dev if asset is NFT, asset param is tokenId, else this value is amount of token
  uint256 public immutable assetParam;
  /// @dev bid token contract address
  address public immutable bidToken;

  /// @dev auction start block number
  uint256 public auctionStartBlock;
  /// @dev bidding end block number
  uint256 public biddingEndBlock;
  /// @dev reveal end block number
  uint256 public revealEndBlock;
  /// @dev winning bidder address
  address public winningBidder;
  /// @dev second bid amount
  uint256 public secondBid;

  bool private auctionEnded;

  /// @dev emit this event when auction started
  event AuctionStarted(uint256 startBlock, uint256 biddingEndBlock, uint256 revealEndBlock);
  /// @dev emit this event when new bid added
  event NewBid(address indexed bidder, bytes32 commitment);
  /// @dev emit this event when revealed
  event Revealed(address indexed bidder, uint256 price);
  /// @dev emit this event when auction finished
  event Finished(address indexed winner, uint256 secondPrice);

  mapping(address => Bid) public bids;

  /**
   * @dev initialize auction params
   * @param _assetType type of asset
   * @param _assetAddress address of asset contract
   * @param _assetParam param of asset(tokenId or amount)
   * @param _bidToken address of bid token
   */
  constructor(AssetType _assetType, address _assetAddress, uint256 _assetParam, address _bidToken) {
    // initialize auction params
    assetType = _assetType;
    assetAddress = _assetAddress;
    assetParam = _assetParam;
    bidToken = _bidToken;
  }

  modifier onlyBeforeBiddingEnd() {
    require(block.number < biddingEndBlock, "Auction: bidding period has ended");
    _;
  }

  modifier onlyDuringRevealPeriod() {
    require(
      block.number >= biddingEndBlock && block.number < revealEndBlock,
      "Auction: reveal period isn't started or has ended"
    );
    _;
  }

  /**
   * @notice start auction
   * @dev This function is called by owner.
   *      Sets lastBlock to blocknumber and emit AuctionStarted event
   * @param _biddingDurationBlocks bidding duration blocks
   * @param _revealDurationBlocks reveal duration blocks
   */
  function start(
    uint256 _biddingDurationBlocks,
    uint256 _revealDurationBlocks
  ) external payable onlyOwner {
    auctionStartBlock = block.number;
    biddingEndBlock = auctionStartBlock + _biddingDurationBlocks;
    revealEndBlock = biddingEndBlock + _revealDurationBlocks;
    auctionEnded = false;

    // lock asset to auction contract
    if (assetType == AssetType.ETH) {
      require(msg.value == assetParam, "Auction: invalid eth amount");
    } else if (assetType == AssetType.ERC20) {
      IERC20(assetAddress).safeTransferFrom(msg.sender, address(this), assetParam);
    } else if (assetType == AssetType.ERC721) {
      IERC721(assetAddress).safeTransferFrom(msg.sender, address(this), assetParam, "");
    } else if (assetType == AssetType.ERC1155) {
      IERC1155(assetAddress).safeTransferFrom(msg.sender, address(this), assetParam, 1, "");
    } else {
      revert("Auction: assetType is invalid");
    }

    emit AuctionStarted(auctionStartBlock, biddingEndBlock, revealEndBlock);
  }

  /**
   * @notice propose new bid
   * @dev This function add new bid with commitment
   * @param commitment new bidding price
   */
  function commitBid(bytes32 commitment) external nonReentrant onlyBeforeBiddingEnd {
    require(auctionStartBlock > 0, "Auction: auction not started yet");
    require(bids[msg.sender].commitment == bytes32(0), "Auction: already committed a bid");

    bids[msg.sender].commitment = commitment;

    emit NewBid(msg.sender, commitment);
  }

  /**
   * @notice reveal bid
   * @dev This function reveals bid price
   * @param price new bidding price
   */
  function revealBid(uint256 price) external payable nonReentrant onlyDuringRevealPeriod {
    require(!auctionEnded, "Auction: already ended");
    require(bids[msg.sender].commitment != bytes32(0), "Auction: no committed bid found");

    bytes32 computedCommitment = keccak256(abi.encodePacked(price, msg.sender));
    require(bids[msg.sender].commitment == computedCommitment, "Auction: invalid commitment");

    bids[msg.sender].deposit = price;
    bids[msg.sender].revealed = true;

    if (price > bids[winningBidder].deposit) {
      address secondBidder = winningBidder;
      secondBid = bids[secondBidder].deposit;
      winningBidder = msg.sender;

      if (secondBidder != address(0)) {
        // release last bidder's token
        if (bidToken == address(0)) {
          payable(secondBidder).transfer(secondBid);
        } else {
          IERC20(bidToken).safeTransfer(secondBidder, secondBid);
        }
      }

      if (bidToken == address(0)) {
        require(msg.value == price, "Auction: invalid eth amount");
      } else {
        IERC20(bidToken).safeTransferFrom(winningBidder, address(this), price);
      }
    } else if (price == bids[winningBidder].deposit) {
      // get random value
      uint256 random = uint256(
        keccak256(abi.encodePacked(bids[winningBidder].commitment, bids[msg.sender].commitment))
      ) % 2;
      if (random == 1) {
        // select previous winner
        secondBid = price;
      } else {
        // select new winner
        address secondBidder = winningBidder;
        secondBid = bids[secondBidder].deposit;
        winningBidder = msg.sender;

        if (secondBidder != address(0)) {
          // release last bidder's token
          if (bidToken == address(0)) {
            payable(secondBidder).transfer(secondBid);
          } else {
            IERC20(bidToken).safeTransfer(secondBidder, secondBid);
          }
        }

        if (bidToken == address(0)) {
          require(msg.value == price, "Auction: invalid eth amount");
        } else {
          IERC20(bidToken).safeTransferFrom(winningBidder, address(this), price);
        }
      }
    } else if (price > secondBid) {
      secondBid = price;
    }

    emit Revealed(msg.sender, price);
  }

  /**
   * @notice finish auction
   * @dev This function finishs auction.
   *      Sends asset to winner and sends bid token to owner.
   */
  function finish() external onlyOwner {
    require(!auctionEnded, "Auction: already ended");
    require(block.number >= revealEndBlock, "Auction: reveal period has not ended yet");

    auctionEnded = true;

    // get asset receiver
    address assetReceiver;
    if (winningBidder == address(0)) {
      assetReceiver = owner();
    } else {
      assetReceiver = winningBidder;
    }

    // sends asset to receiver
    if (assetType == AssetType.ETH) {
      payable(assetReceiver).transfer(assetParam);
    } else if (assetType == AssetType.ERC20) {
      IERC20(assetAddress).safeTransfer(assetReceiver, assetParam);
    } else if (assetType == AssetType.ERC721) {
      IERC721(assetAddress).safeTransferFrom(address(this), assetReceiver, assetParam);
    } else if (assetType == AssetType.ERC1155) {
      IERC1155(assetAddress).safeTransferFrom(address(this), assetReceiver, assetParam, 1, "");
    }

    // sends bid token to owner
    if (bidToken == address(0)) {
      payable(owner()).transfer(secondBid);
      payable(winningBidder).transfer(bids[winningBidder].deposit - secondBid);
    } else {
      IERC20(bidToken).safeTransfer(owner(), secondBid);
      IERC20(bidToken).safeTransfer(winningBidder, bids[winningBidder].deposit - secondBid);
    }

    emit Finished(assetReceiver, secondBid);
  }
}

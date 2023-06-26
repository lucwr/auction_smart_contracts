// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ReentrancyGuard} from "./libraries/ReentrancyGuard.sol";

/**
 * @title Public Auction Contract
 * @dev There is a prize (NFT or some object with the owner property) which is being auctioned. At block n,
 *      the auction is started by the deployer of the contract. Several players compete with each other by submitting bids.
 *      If player i submits a bid which is more than bids of other players, then player i has the highest bid.
 *      If player i has the highest bids at some block and there is no other higher bids for three consecutive
 *      blocks then player i is the winner of the auction. In this case, the deployer of the contract sends the prize to the winner.
 *      No bids are accepted if a previous bid is >3 blocks back in history
 *      If no bids are submitted, then the prize stays with the deployer of the contract.
 */
contract PublicAuction is ReentrancyGuard, Ownable {
  using SafeERC20 for IERC20;

  /// @dev asset type can be ERC20, ERC721 and ERC1155
  enum AssetType {
    ERC20,
    ERC721,
    ERC1155
  }

  /// @dev asset type
  AssetType public immutable assetType;
  /// @dev asset contract address
  address public immutable assetAddress;
  /// @dev if asset is NFT, asset param is tokenId, else this value is amount of token
  uint256 public immutable assetParam;
  /// @dev bid token contract address
  address public immutable bidToken;

  /// @dev max interval(player must submit bid in this interval)
  uint256 public maxBidInterval = 3;
  /// @dev last bid price
  uint256 public lastPrice;
  /// @dev last bid block number
  uint256 private lastBlock;
  /// @dev last bidder address
  address private lastBidder;

  /// @dev emit this event when auction started
  event AuctionStarted(uint256 blockNumer);
  /// @dev emit this event when new bid added
  event NewBid(address indexed bider, uint256 indexed bidPrice, uint256 blockNumber);
  /// @dev emit this event when auction finished
  event Finished(address indexed winner, uint256 indexed bidPrice);

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

    // lock asset to auction contract
    if (assetType == AssetType.ERC20) {
      IERC20(assetAddress).safeTransferFrom(msg.sender, address(this), assetParam);
    } else if (assetType == AssetType.ERC721) {
      IERC721(assetAddress).safeTransferFrom(msg.sender, address(this), assetParam, "");
    } else if (assetType == AssetType.ERC1155) {
      IERC1155(assetAddress).safeTransferFrom(msg.sender, address(this), assetParam, 1, "");
    } else {
      revert("Auction: assetType is invalid");
    }
  }

  /**
   * @notice start auction
   * @dev This function is called by owner.
   *      Sets lastBlock to blocknumber and emit AuctionStarted event
   */
  function start() external onlyOwner {
    lastBlock = block.number;

    emit AuctionStarted(lastBlock);
  }

  /**
   * @notice propose new bid
   * @dev This functions changes last bid params, and release last bidder's token
   *      and locks new bidder's token
   * @param _price new bidding price
   */
  function propose(uint256 _price) external {
    require(lastBlock > 0, "Auction: auction not started yet");
    require(block.number <= lastBlock + maxBidInterval, "Auction: No bids anymore");
    require(_price > lastPrice, "Auction: bid price is low than last one");

    // changes last bid params
    lastPrice = _price;
    lastBidder = msg.sender;
    lastBlock = block.number;

    if (lastBidder != address(0)) {
      // release last bidder's token
      IERC20(bidToken).safeTransferFrom(address(this), lastBidder, lastPrice);
    }
    // lock new bidder's token
    IERC20(bidToken).safeTransferFrom(msg.sender, address(this), _price);

    emit NewBid(msg.sender, _price, block.number);
  }

  /**
   * @notice start auction
   * @dev This function finishs auction.
   *      Sends asset to winner and sends bid token to owner.
   */
  function finish() external onlyOwner {
    require(block.number > lastBlock + maxBidInterval, "Auction: auction not finished");

    // get asset receiver
    address assetReceiver;
    if (lastBidder == address(0)) {
      assetReceiver = owner();
    } else {
      assetReceiver = lastBidder;
    }

    // sends asset to receiver
    if (assetType == AssetType.ERC20) {
      IERC20(assetAddress).safeTransferFrom(address(this), assetReceiver, assetParam);
    } else if (assetType == AssetType.ERC721) {
      IERC721(assetAddress).safeTransferFrom(address(this), assetReceiver, assetParam, "");
    } else if (assetType == AssetType.ERC1155) {
      IERC1155(assetAddress).safeTransferFrom(address(this), assetReceiver, assetParam, 1, "");
    }

    // sends bid token to owner
    IERC20(bidToken).safeTransferFrom(address(this), owner(), lastPrice);

    emit Finished(assetReceiver, lastPrice);
  }
}

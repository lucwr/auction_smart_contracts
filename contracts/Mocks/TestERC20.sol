// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
  constructor() ERC20("TestERC20", "TestERC20") {
    _mint(msg.sender, 1000 * 10 ** 18);
  }
}

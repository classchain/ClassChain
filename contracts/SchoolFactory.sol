// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MultiSigWallet.sol";

contract SchoolFactory {
    event SchoolFundCreated(string indexed projectId, address indexed fundAddress, address creator);

    // ساخت خزانه با owner فقط خود caller (ساده برای شروع)
    function createSingleOwnerFund(string memory projectId) external returns (address fundAddress) {
        address[] memory owners = new address[](1);
        owners[0] = msg.sender;

        MultiSigWallet newFund = new MultiSigWallet(owners, 1);
        fundAddress = address(newFund);

        emit SchoolFundCreated(projectId, fundAddress, msg.sender);
    }

    // اگر بعداً بخوای چند owner داشته باشی
    function createFund(string memory projectId, address[] memory owners, uint numConfirmations) external returns (address) {
        MultiSigWallet newFund = new MultiSigWallet(owners, numConfirmations);
        address fundAddress = address(newFund);
        emit SchoolFundCreated(projectId, fundAddress, msg.sender);
        return fundAddress;
    }
}
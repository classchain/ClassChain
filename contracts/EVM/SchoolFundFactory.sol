// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SchoolTokenFund.sol";
import "./MultiSigWallet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SchoolFundFactory is Ownable {
    mapping(string => address) public projectFunds;

    address[] public defaultAllowedTokens;
    bool public defaultIncludeCLC;

    event FundCreated(
        string indexed projectId,
        address indexed fundAddress,
        address indexed ownerOrMultisig,
        bool isMultisig,
        uint256 requiredConfirmations
    );

    constructor(address[] memory _defaultAllowedTokens, bool _defaultIncludeCLC) Ownable(msg.sender) {
        defaultAllowedTokens = _defaultAllowedTokens;
        defaultIncludeCLC = _defaultIncludeCLC;
    }

    function createSingleOwnerFund(
        string memory projectId,
        address singleOwner
    ) external onlyOwner returns (address fundAddress) {
        require(projectFunds[projectId] == address(0), "Fund already exists");
        require(singleOwner != address(0), "Invalid owner");

        SchoolTokenFund fund = new SchoolTokenFund(defaultAllowedTokens, defaultIncludeCLC);
        fund.transferOwnership(singleOwner);

        projectFunds[projectId] = address(fund);
        emit FundCreated(projectId, address(fund), singleOwner, false, 0);

        return address(fund);
    }

    function createMultisigFund(
        string memory projectId,
        address[] memory multisigOwners,
        uint256 requiredConfirmations
    ) external onlyOwner returns (address fundAddress, address multisigAddress) {
        require(projectFunds[projectId] == address(0), "Fund already exists");
        require(multisigOwners.length > 0, "Owners required");
        require(
            requiredConfirmations > 0 && requiredConfirmations <= multisigOwners.length,
            "Invalid required confirmations"
        );

        MultiSigWallet multisig = new MultiSigWallet(multisigOwners, requiredConfirmations);

        SchoolTokenFund fund = new SchoolTokenFund(defaultAllowedTokens, defaultIncludeCLC);
        fund.transferOwnership(address(multisig));

        projectFunds[projectId] = address(fund);
        emit FundCreated(projectId, address(fund), address(multisig), true, requiredConfirmations);

        return (address(fund), address(multisig));
    }

    function getFundAddress(string memory projectId) external view returns (address) {
        return projectFunds[projectId];
    }

    function updateDefaultAllowedTokens(address[] memory newTokens) external onlyOwner {
        defaultAllowedTokens = newTokens;
    }

    function setDefaultIncludeCLC(bool include) external onlyOwner {
        defaultIncludeCLC = include;
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BarangayRecords {
    struct Record {
        string recordId;
        string residentName;
        string documentType;
        string documentHash;
        string ipfsCid;
        uint256 createdAt;
        address uploadedBy;
        bool exists;
    }

    address public owner;
    mapping(string => Record) private records;

    event RecordStored(
        string indexed recordId,
        string residentName,
        string documentType,
        string documentHash,
        uint256 createdAt,
        address indexed uploadedBy
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addRecord(
        string memory recordId,
        string memory residentName,
        string memory documentType,
        string memory documentHash,
        string memory ipfsCid
    ) public onlyOwner {
        require(bytes(recordId).length > 0, "Record ID is required");
        require(bytes(documentHash).length > 0, "Document hash is required");
        require(!records[recordId].exists, "Record already exists");

        records[recordId] = Record({
            recordId: recordId,
            residentName: residentName,
            documentType: documentType,
            documentHash: documentHash,
            ipfsCid: ipfsCid,
            createdAt: block.timestamp,
            uploadedBy: msg.sender,
            exists: true
        });

        emit RecordStored(recordId, residentName, documentType, documentHash, block.timestamp, msg.sender);
    }

    function getRecord(string memory recordId) public view returns (Record memory) {
        require(records[recordId].exists, "Record not found");
        return records[recordId];
    }
}

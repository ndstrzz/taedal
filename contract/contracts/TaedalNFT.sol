// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TaedalNFT — ERC-721 with royalties and on-chain artwork linkage
contract TaedalNFT is ERC721URIStorage, ERC2981, Ownable {
    uint256 public nextId = 1;

    event ArtworkLinked(
        address indexed minter,
        uint256 indexed artworkId,
        uint256 indexed tokenId,
        string tokenURI
    );

    constructor(address royaltyReceiver, uint96 feeNumeratorBps)
        ERC721("Taedal", "TAEDAL")
        Ownable(msg.sender)
    {
        // e.g. 500 = 5%
        _setDefaultRoyalty(royaltyReceiver, feeNumeratorBps);
    }

    /// @notice Public mint to msg.sender, records your app's artworkId for linkage
    function mintWithURI(string memory uri, uint256 artworkId) external returns (uint256 tokenId) {
        tokenId = nextId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);
        emit ArtworkLinked(msg.sender, artworkId, tokenId, uri);
    }

    /// @notice Optional owner mint for server-controlled flows
    function mintToWithURI(address to, string memory uri, uint256 artworkId)
        external
        onlyOwner
        returns (uint256 tokenId)
    {
        tokenId = nextId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit ArtworkLinked(to, artworkId, tokenId, uri);
    }

    // --- Royalties admin ---
    function setDefaultRoyalty(address receiver, uint96 feeNumeratorBps) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumeratorBps);
    }
    function deleteDefaultRoyalty() external onlyOwner {
        _deleteDefaultRoyalty();
    }

    // Required override
    function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721URIStorage, ERC2981)
    returns (bool)
{
    return super.supportsInterface(interfaceId);
}

}

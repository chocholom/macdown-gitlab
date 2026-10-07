import Foundation

public enum Pagination {
    // Avoid cutting through a text line, image or table row. Oversized blocks
    // can span pages; their individual text lines still provide safe boundaries.
    public static func breaks(height: Double,pageHeight: Double,avoid: [[Double]]) -> [Double] {
        guard height > 0,pageHeight > 0,height.isFinite,pageHeight.isFinite else { return [0] }
        let intervals=avoid.filter{$0.count == 2}.sorted{$0[0] > $1[0]}
        var result=[0.0],start=0.0
        while start < height {
            var end=min(height,start+pageHeight)
            for interval in intervals where interval[1]-interval[0] <= pageHeight {
                if interval[0] > start+1 && interval[0] < end && interval[1] > end { end=interval[0] }
            }
            if end <= start+1 { end=min(height,start+pageHeight) }
            result.append(end);start=end
        }
        return result
    }
}

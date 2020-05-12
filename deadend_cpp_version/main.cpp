#include <algorithm>
#include <vector>
#include <iterator>
#include <iostream>
#include <utility>
#include <functional>
#include <string>
#include <experimental/optional>

using namespace std;
using namespace std::experimental;

enum class Color {
    WHITE,
    BLACK
};

struct Piece {
    Color color;
};

struct Cell {
    optional<Piece> piece;
};

template <typename A, typename B>
constexpr auto sum_through(A a, B b) {
    return (b-a+1)*(a+b)/2;
}

/*
*           0= (1..0) = 0
**          1= (1..1) = 1
***         2= (1..2) = 3
****        3= (1..3) = 6
*****       4= (1..4) = 10
******      5= (1..5) = 15
*******     6= (1..6) = 21
********    7= (1..7) = 28
********    8= (1..8) = 36
 *******    9= (1..8) + (8..8) = 36 + 8
  ******    10= (1..8) + (7..8) = 36 + 15
   *****    11= (1..8) + (6..8) = 36 + 21
    ****    12= (1..8) + (5..8) = 36 + 26
     ***    13= (1..8) + (4..8) = 36 + 30
      **    14= (1..8) + (3..8) = 36 + 33
       *    15= (1..8) + (2..8) = 36 + 35
*/

struct Board {
    array<Cell,72> cells;

    Cell& at(int r, int c) {
        if (r <= 8) {
            return cells[ sum_through(1,r) + c ];
        } else {
            return cells[ sum_through(1,8) + sum_through(17-r,8) + c - (r-8) ];
        }
    }
};

int main() {
    Board board;

    cout << "Performing sanit checks..." << endl;
    Cell* ptr = nullptr;
    for (int r=0; r<8; ++r) {
        for (int c=0; c<=r; ++c) {
            Cell* ptr2 = &board.at(r,c);
            cout << "R: " << r << ", C: " << c << ", P=" << (void*)ptr2 << endl;
            if (ptr) {
                if (ptr+1 != ptr2) {
                    cout << "Sanity check failed!" << endl;
                    return 1;
                }
            }
            ptr = ptr2;
        }
    }
    for (int r=8; r<16; ++r) {
        for (int c=r-8; c<8; ++c) {
            Cell* ptr2 = &board.at(r,c);
            cout << "R: " << r << ", C: " << c << ", P=" << (void*)ptr2 << endl;
            if (ptr) {
                Cell* ptr2 = &board.at(r,c);
                if (ptr+1 != ptr2) {
                    cout << "Sanity check FAILED!" << endl;
                    return 1;
                }
            }
            ptr = ptr2;
        }
    }
    cout << "Sanity checks PASSED." << endl;


}